import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  opendirSync,
  readSync,
  realpathSync
} from 'node:fs';
import { dirname, isAbsolute, join, parse, relative, resolve, sep, win32 } from 'node:path';
import { redactSensitiveText } from '../install/sensitive-redaction.mjs';

export const packetLimits = Object.freeze({
  entries: 2000,
  files: 250,
  fileBytes: 2 * 1024 * 1024,
  totalBytes: 16 * 1024 * 1024,
  depth: 12,
  records: 10000
});

export function safeText(value, length = 180) {
  if (typeof value !== 'string') return null;
  return redactSensitiveText(value)
    .replace(/https?:\/\/[^\s]+/gi, '[URL omitted]')
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .slice(0, length);
}

function contained(root, path) {
  const suffix = relative(root, path);
  return (
    suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
  );
}

// Inspect every component, including the explicit root's ancestors. A junction
// must not turn a local packet review into a read of another installation.
function inspectPath(path) {
  const parts = relative(parse(path).root, path).split(sep).filter(Boolean);
  let current = parse(path).root;
  let stat = lstatSync(current);
  for (const part of parts) {
    current = join(current, part);
    stat = lstatSync(current);
    if (stat.isSymbolicLink()) throw Object.assign(new Error('link'), { code: 'LINK' });
  }
  return stat;
}

export function openPacket(rootPath, limits = packetLimits) {
  if (typeof rootPath !== 'string' || !rootPath.trim()) {
    throw new Error('An explicit evidence directory is required.');
  }
  const root = resolve(rootPath);
  try {
    if (!inspectPath(root).isDirectory()) throw new Error('not-directory');
  } catch {
    throw new Error(
      'Evidence root must be a readable directory with no symbolic-link or junction components.'
    );
  }
  const realRoot = realpathSync(root);
  const issues = [];
  const files = [];
  const counts = { entries: 0, files: 0, bytesRead: 0, ignored: 0 };
  let stopped = false;
  const pointer = (path) => safeText(relative(root, path).replaceAll('\\', '/') || '.');
  const issue = (code, path, severity = 'warning') => {
    issues.push({ code, severity, source: { file: pointer(path) } });
  };
  function walk(directory, depth) {
    if (depth > limits.depth) {
      issue('depth-limit', directory);
      return;
    }
    let stream;
    try {
      if (!inspectPath(directory).isDirectory() || !contained(realRoot, realpathSync(directory))) {
        issue('unsafe-path', directory);
        return;
      }
      stream = opendirSync(directory);
      let entry;
      while (!stopped && (entry = stream.readSync())) {
        const path = join(directory, entry.name);
        if (++counts.entries > limits.entries) {
          issue('entry-limit', directory);
          stopped = true;
          break;
        }
        if (entry.isSymbolicLink()) {
          issue('link-skipped', path);
          continue;
        }
        if (
          /^(?:\.git|node_modules|private-relay-config|secrets-not-included)$/i.test(entry.name)
        ) {
          counts.ignored++;
          continue;
        }
        if (entry.isDirectory()) walk(path, depth + 1);
        else if (entry.isFile() && /\.jsonl?$/i.test(entry.name)) {
          if (files.length >= limits.files) {
            issue('file-limit', path);
            stopped = true;
            break;
          }
          files.push(path);
        } else counts.ignored++;
      }
    } catch {
      issue('directory-read-error', directory, 'read-error');
    } finally {
      stream?.closeSync();
    }
  }
  walk(root, 0);
  files.sort();

  function read(path) {
    let fd;
    try {
      if (
        !contained(root, path) ||
        !inspectPath(path).isFile() ||
        !contained(realRoot, realpathSync(path))
      ) {
        issue('unsafe-path', path);
        return null;
      }
      fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const stat = fstatSync(fd);
      if (!stat.isFile()) {
        issue('unsafe-path', path);
        return null;
      }
      if (stat.size > limits.fileBytes || counts.bytesRead + stat.size > limits.totalBytes) {
        issue(stat.size > limits.fileBytes ? 'file-size-limit' : 'total-size-limit', path);
        return null;
      }
      // A fixed buffer also bounds a file that grows after the size check.
      const available = Math.min(limits.fileBytes, limits.totalBytes - counts.bytesRead);
      const buffer = Buffer.alloc(Math.min(stat.size + 1, available + 1));
      let used = 0;
      let amount;
      do {
        amount = readSync(fd, buffer, used, buffer.length - used, null);
        used += amount;
      } while (amount && used < buffer.length);
      counts.bytesRead += used;
      if (used > stat.size || used > available) {
        issue('file-changed-or-limit', path);
        return null;
      }
      counts.files++;
      return buffer
        .subarray(0, used)
        .toString('utf8')
        .replace(/^\uFEFF/, '');
    } catch (error) {
      issue(
        error.code === 'LINK' ? 'link-skipped' : 'file-read-error',
        path,
        error.code === 'LINK' ? 'warning' : 'read-error'
      );
      return null;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  function sidecar(value, sourceFile) {
    if (typeof value !== 'string' || !value || value.includes('\0')) return { status: 'invalid' };
    const normalized = value.replace(/[\\/]/g, sep);
    // Windows paths remain absolute references when reviewing on another OS.
    if (win32.isAbsolute(value) && !isAbsolute(normalized)) return { status: 'outside-root' };
    const path = isAbsolute(normalized)
      ? resolve(normalized)
      : resolve(dirname(sourceFile), normalized);
    if (!contained(root, path)) return { status: 'outside-root' };
    try {
      const stat = inspectPath(path);
      if (!contained(realRoot, realpathSync(path))) return { status: 'outside-root' };
      return { status: stat.isFile() ? 'present' : 'not-file', file: pointer(path) };
    } catch (error) {
      return {
        status:
          error.code === 'LINK'
            ? 'link-skipped'
            : error.code === 'ENOENT'
              ? 'missing'
              : 'unreadable',
        file: pointer(path)
      };
    }
  }
  return { files, read, pointer, sidecar, counts, issues, limits };
}
