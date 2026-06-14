import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  canonicalizeJson,
  licenseKeyId,
  licenseSignatureAlgorithm
} from '../license/license-format.mjs';

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
      Buffer.from(canonicalizeJson(envelope.signedLicense), 'utf8'),
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

  return { license, signedLicense: value.license, signature };
}

function parseLicenseBody(value) {
  if (!isRecord(value)) {
    return new Error('License body must be an object.');
  }

  if (value.schemaVersion === 1) {
    return parseLegacyLicenseBody(value);
  }

  if (value.schemaVersion === 2) {
    return parseV2LicenseBody(value);
  }

  return new Error('License schemaVersion must be 1 or 2.');
}

function parseLegacyLicenseBody(value) {
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

function parseV2LicenseBody(value) {
  const licenseKind = parseLicenseKind(value.licenseKind);
  if (licenseKind instanceof Error) return licenseKind;

  const licenseId = requiredString(value.licenseId, 'licenseId');
  const shopName = requiredString(value.shopName, 'shopName');
  const issuedAt = requiredString(value.issuedAt, 'issuedAt');
  if (licenseId instanceof Error) return licenseId;
  if (shopName instanceof Error) return shopName;
  if (issuedAt instanceof Error) return issuedAt;
  if (!Number.isFinite(Date.parse(issuedAt))) {
    return new Error('License issuedAt must be an ISO timestamp.');
  }

  if (licenseKind === 'dataOnly') {
    const terminatedLicenseId = requiredString(value.terminatedLicenseId, 'terminatedLicenseId');
    const terminationReason = requiredString(value.terminationReason, 'terminationReason');
    if (terminatedLicenseId instanceof Error) return terminatedLicenseId;
    if (terminationReason instanceof Error) return terminationReason;
    return {
      schemaVersion: 2,
      licenseKind,
      licenseId,
      terminatedLicenseId,
      shopName,
      issuedAt,
      terminationReason
    };
  }

  const updateWindowEnd = requiredString(value.updateWindowEnd, 'updateWindowEnd');
  if (updateWindowEnd instanceof Error) return updateWindowEnd;
  if (!isValidIsoDate(updateWindowEnd)) {
    return new Error('License updateWindowEnd must be a YYYY-MM-DD date.');
  }

  if (licenseKind === 'paid') {
    return {
      schemaVersion: 2,
      licenseKind,
      licenseId,
      shopName,
      issuedAt,
      updateWindowEnd
    };
  }

  const operationEnd = requiredString(value.operationEnd, 'operationEnd');
  if (operationEnd instanceof Error) return operationEnd;
  if (!isValidIsoDate(operationEnd)) {
    return new Error('License operationEnd must be a YYYY-MM-DD date.');
  }

  return {
    schemaVersion: 2,
    licenseKind,
    licenseId,
    shopName,
    issuedAt,
    updateWindowEnd,
    operationEnd
  };
}

function parseLicenseKind(value) {
  if (value === 'paid' || value === 'trial' || value === 'dataOnly') {
    return value;
  }
  return new Error('License licenseKind must be paid, trial, or dataOnly.');
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
