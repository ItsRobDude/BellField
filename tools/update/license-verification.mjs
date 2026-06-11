import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export const licenseSignatureAlgorithm = 'Ed25519';
export const licenseKeyId = 'bellfield-license-v1';

const embeddedLicensePublicKeyPem = [
  '-----BEGIN PUBLIC KEY-----',
  'MCowBQYDK2VwAyEAGhWH5l32n93V4AeHLgWnRN70ekYeRfkJFxJ0QHGBdgg=',
  '-----END PUBLIC KEY-----',
  ''
].join('\n');

export function verifyLicenseFile(input) {
  const licensePath = input.licensePath?.trim();
  if (!licensePath) {
    return {
      status: 'missing',
      message: 'BELLFIELD_LICENSE_PATH is not configured.'
    };
  }

  if (!existsSync(licensePath)) {
    return {
      status: 'missing',
      message: `License file was not found at ${licensePath}.`
    };
  }

  try {
    return verifyLicenseContent(readFileSync(licensePath, 'utf8'), input.publicKeyPem);
  } catch {
    return {
      status: 'invalid',
      message: 'License file could not be read.'
    };
  }
}

export function verifyLicenseContent(rawLicenseFile, publicKeyPem = embeddedLicensePublicKeyPem) {
  let parsed;
  try {
    parsed = JSON.parse(rawLicenseFile);
  } catch {
    return {
      status: 'invalid',
      message: 'License file is not valid JSON.'
    };
  }

  const envelope = parseLicenseEnvelope(parsed);
  if (envelope instanceof Error) {
    return {
      status: 'invalid',
      message: envelope.message
    };
  }

  let signature;
  try {
    signature = Buffer.from(envelope.signature.value, 'base64url');
  } catch {
    return {
      status: 'invalid',
      message: 'License signature is not valid base64url.'
    };
  }

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const signatureOk = verify(
      null,
      Buffer.from(canonicalizeJson(envelope.license), 'utf8'),
      publicKey,
      signature
    );
    if (!signatureOk) {
      return {
        status: 'invalid',
        message: 'License signature did not verify.'
      };
    }
  } catch {
    return {
      status: 'invalid',
      message: 'License signature could not be verified.'
    };
  }

  return {
    status: 'valid',
    license: {
      ...envelope.license,
      keyId: envelope.signature.keyId
    }
  };
}

function parseLicenseEnvelope(value) {
  if (!isRecord(value)) {
    return new Error('License file must be a JSON object.');
  }

  const license = parseLicenseBody(value.license);
  if (license instanceof Error) {
    return license;
  }

  const signature = parseLicenseSignature(value.signature);
  if (signature instanceof Error) {
    return signature;
  }

  return { license, signature };
}

function parseLicenseBody(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    return new Error('License schemaVersion must be 1.');
  }

  const licenseId = requiredString(value.licenseId, 'licenseId');
  const shopName = requiredString(value.shopName, 'shopName');
  const issuedAt = requiredString(value.issuedAt, 'issuedAt');
  const updateWindowEnd = requiredString(value.updateWindowEnd, 'updateWindowEnd');
  if (licenseId instanceof Error) return licenseId;
  if (shopName instanceof Error) return shopName;
  if (issuedAt instanceof Error) return issuedAt;
  if (updateWindowEnd instanceof Error) return updateWindowEnd;
  if (!Number.isFinite(Date.parse(issuedAt))) {
    return new Error('License issuedAt must be an ISO timestamp.');
  }
  if (!isValidIsoDate(updateWindowEnd)) {
    return new Error('License updateWindowEnd must be a YYYY-MM-DD date.');
  }

  return {
    schemaVersion: 1,
    licenseId,
    shopName,
    issuedAt,
    updateWindowEnd
  };
}

function parseLicenseSignature(value) {
  if (!isRecord(value)) {
    return new Error('License signature must be an object.');
  }
  if (value.algorithm !== licenseSignatureAlgorithm) {
    return new Error(`License signature algorithm must be ${licenseSignatureAlgorithm}.`);
  }
  if (value.keyId !== licenseKeyId) {
    return new Error(`License keyId must be ${licenseKeyId}.`);
  }

  const signatureValue = requiredString(value.value, 'signature.value');
  if (signatureValue instanceof Error) {
    return signatureValue;
  }

  return {
    algorithm: licenseSignatureAlgorithm,
    keyId: licenseKeyId,
    value: signatureValue
  };
}

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return new Error(`License ${fieldName} must be a non-empty string.`);
  }
  if (value.trim() !== value) {
    return new Error(`License ${fieldName} must not include surrounding whitespace.`);
  }
  return value;
}

function canonicalizeJson(value) {
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
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`)
      .join(',')}}`;
  }
  throw new Error('Unsupported value in canonical JSON.');
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
