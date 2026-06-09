import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { EncryptedSecretRecord } from './company-settings.types';

const KEY_ENV_NAME = 'BELLFIELD_SECRETS_KEY';
const MIN_SECRET_SOURCE_LENGTH = 32;
const DEV_FALLBACK_KEY_LABEL = 'bellfield-dev-integration-secret-key-do-not-use-in-production';

@Injectable()
export class SecretCryptoService implements OnModuleInit {
  private readonly logger = new Logger(SecretCryptoService.name);
  private key: Buffer | null = null;

  onModuleInit(): void {
    this.getKey();
  }

  encryptSecret(secret: string): EncryptedSecretRecord {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedValue: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64')
    };
  }

  decryptSecret(record: EncryptedSecretRecord): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getKey(),
      Buffer.from(record.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(record.encryptedValue, 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  private getKey(): Buffer {
    if (this.key) {
      return this.key;
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const configured = process.env[KEY_ENV_NAME]?.trim();
    if (!configured) {
      if (isProduction) {
        throw new Error(
          `${KEY_ENV_NAME} is required in production so integration secrets can be encrypted at rest.`
        );
      }
      this.logger.warn(
        `${KEY_ENV_NAME} not set; using a development-only key for integration secrets. Configure it before any real deployment.`
      );
      this.key = createHash('sha256').update(DEV_FALLBACK_KEY_LABEL).digest();
      return this.key;
    }

    if (configured.length < MIN_SECRET_SOURCE_LENGTH) {
      throw new Error(
        `${KEY_ENV_NAME} must be at least ${MIN_SECRET_SOURCE_LENGTH} characters or encode exactly 32 random bytes.`
      );
    }

    this.key = parseConfiguredKey(configured);
    return this.key;
  }
}

function parseConfiguredKey(configured: string): Buffer {
  if (configured.startsWith('base64:')) {
    const decoded = Buffer.from(configured.slice('base64:'.length), 'base64');
    if (decoded.length !== 32) {
      throw new Error('BELLFIELD_SECRETS_KEY base64 value must decode to exactly 32 bytes.');
    }
    return decoded;
  }

  if (/^[0-9a-f]{64}$/i.test(configured)) {
    return Buffer.from(configured, 'hex');
  }

  return createHash('sha256').update(configured, 'utf8').digest();
}
