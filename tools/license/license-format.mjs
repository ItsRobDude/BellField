export const licenseSignatureAlgorithm = 'Ed25519';
export const licenseKeyId = 'bellfield-license-v1';

export function canonicalizeJson(value) {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number.');
    }
    return JSON.stringify(value);
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJson(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(',')}}`;
  }

  throw new Error('Unsupported value in canonical JSON.');
}

export function assertNonBlank(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required --${name}=<value>.`);
  }
  if (value.trim() !== value) {
    throw new Error(`--${name} must not include surrounding whitespace.`);
  }
  return value;
}

export function assertIsoTimestamp(value, name) {
  const checked = assertNonBlank(value, name);
  if (!Number.isFinite(Date.parse(checked))) {
    throw new Error(`--${name} must be an ISO timestamp.`);
  }
  return checked;
}

export function assertIsoDate(value, name) {
  const checked = assertNonBlank(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checked)) {
    throw new Error(`--${name} must be a YYYY-MM-DD date.`);
  }

  const [year, month, day] = checked.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`--${name} must be a real calendar date.`);
  }
  return checked;
}

export function readArgs() {
  return Object.fromEntries(
    process.argv
      .slice(2)
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, ...value] = arg.slice(2).split('=');
        return [key, value.join('=') || 'true'];
      })
  );
}
