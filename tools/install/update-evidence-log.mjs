import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export function createUpdateEvidenceLog({ installRoot, now = () => new Date() }) {
  if (!installRoot) {
    throw new Error('installRoot is required to create an update evidence log.');
  }

  const logRoot = join(installRoot, 'data', 'logs', 'update');
  mkdirSync(logRoot, { recursive: true });
  const { fd, logPath } = reserveLogFile(logRoot, now());
  let closed = false;

  function writeRecord(event, payload = {}) {
    if (closed) {
      throw new Error(`Cannot write to closed update evidence log: ${logPath}`);
    }

    const record = {
      timestamp: now().toISOString(),
      event,
      ...payload
    };
    writeSync(fd, `${JSON.stringify(record)}\n`, undefined, 'utf8');
    fsyncSync(fd);
    return record;
  }

  return {
    logPath,
    writeEvent(prefix, payload) {
      return writeRecord(prefix, payload);
    },
    writeFatal(payload) {
      return writeRecord('BELLFIELD_UPDATE_FATAL', payload);
    },
    close() {
      if (closed) {
        return;
      }
      try {
        fsyncSync(fd);
      } finally {
        closeSync(fd);
        closed = true;
      }
    }
  };
}

function reserveLogFile(logRoot, date) {
  const stamp = formatUpdateLogTimestamp(date);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const suffix = attempt === 1 ? '' : `-${attempt}`;
    const logPath = join(logRoot, `update-${stamp}${suffix}.jsonl`);
    try {
      return { fd: openSync(logPath, 'wx'), logPath };
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
    }
  }
  throw new Error(`Unable to reserve a unique BellField update evidence log for ${stamp}.`);
}

function formatUpdateLogTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    'Z'
  ].join('');
}
