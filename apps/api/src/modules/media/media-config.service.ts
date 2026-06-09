import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const DEFAULT_TOKEN_TTL_SECONDS = 5 * 60;
const MIN_PRODUCTION_TOKEN_SECRET_LENGTH = 32;
const INSECURE_PRODUCTION_TOKEN_SECRETS = new Set([
  'bellfield-dev-media-token-secret-do-not-use-in-production',
  'replace-with-a-long-random-secret'
]);

/**
 * Reads media-related configuration from the environment and applies the
 * BellField mixed-posture rule:
 *
 *   - production must fail fast if required media config is missing
 *   - dev/test may fall back to repo-local paths and a clearly-marked
 *     weak token secret, with a warning emitted on boot
 *
 * Configuration is loaded once at module init. The service exposes resolved
 * values plus helpers for resolving safe blob paths under the media root.
 */
@Injectable()
export class MediaConfigService implements OnModuleInit {
  private readonly logger = new Logger(MediaConfigService.name);
  private loaded = false;
  private mediaRoot = '';
  private resolvedMediaRoot = '';
  private tokenSecret = '';
  private maxBytes = DEFAULT_MAX_BYTES;
  private tokenTtlSeconds = DEFAULT_TOKEN_TTL_SECONDS;

  onModuleInit(): void {
    this.loadConfig();
  }

  private loadConfig(): void {
    if (this.loaded) {
      return;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    const configuredRoot = process.env.BELLFIELD_MEDIA_ROOT?.trim();
    if (!configuredRoot) {
      if (isProduction) {
        throw new Error(
          'BellField media is not configured: set BELLFIELD_MEDIA_ROOT to the absolute path that should hold uploaded blobs.'
        );
      }
      this.mediaRoot = path.join(tmpdir(), 'bellfield-media-dev');
      this.logger.warn(
        `BELLFIELD_MEDIA_ROOT not set; using dev fallback at ${this.mediaRoot}. Configure it explicitly for any non-dev deployment.`
      );
    } else {
      this.mediaRoot = configuredRoot;
    }

    if (!existsSync(this.mediaRoot)) {
      try {
        mkdirSync(this.mediaRoot, { recursive: true });
      } catch (error) {
        throw new Error(
          `BellField media root could not be created at ${this.mediaRoot}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }

    this.resolvedMediaRoot = path.resolve(this.mediaRoot);

    const configuredSecret = process.env.BELLFIELD_MEDIA_TOKEN_SECRET?.trim();
    if (!configuredSecret) {
      if (isProduction) {
        throw new Error(
          'BellField media is not configured: set BELLFIELD_MEDIA_TOKEN_SECRET to a long random value for signed upload/download tokens.'
        );
      }
      this.tokenSecret = 'bellfield-dev-media-token-secret-do-not-use-in-production';
      this.logger.warn(
        'BELLFIELD_MEDIA_TOKEN_SECRET not set; using a weak dev fallback. Configure it explicitly for any non-dev deployment.'
      );
    } else {
      const normalizedConfiguredSecret = configuredSecret.toLowerCase();
      if (
        isProduction &&
        (configuredSecret.length < MIN_PRODUCTION_TOKEN_SECRET_LENGTH ||
          INSECURE_PRODUCTION_TOKEN_SECRETS.has(normalizedConfiguredSecret))
      ) {
        throw new Error(
          `BellField media token secret is too weak for production: set BELLFIELD_MEDIA_TOKEN_SECRET to at least ${MIN_PRODUCTION_TOKEN_SECRET_LENGTH} random characters.`
        );
      }
      this.tokenSecret = configuredSecret;
    }

    const configuredMaxBytes = process.env.BELLFIELD_MEDIA_MAX_BYTES?.trim();
    if (configuredMaxBytes) {
      const parsed = Number(configuredMaxBytes);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.maxBytes = Math.floor(parsed);
      } else {
        this.logger.warn(
          `Ignoring invalid BELLFIELD_MEDIA_MAX_BYTES=${configuredMaxBytes}; using ${DEFAULT_MAX_BYTES}.`
        );
      }
    }

    const configuredTokenTtl = process.env.BELLFIELD_MEDIA_TOKEN_TTL_SECONDS?.trim();
    if (configuredTokenTtl) {
      const parsed = Number(configuredTokenTtl);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.tokenTtlSeconds = Math.floor(parsed);
      }
    }

    this.loaded = true;
  }

  getMediaRoot(): string {
    this.loadConfig();
    return this.resolvedMediaRoot;
  }

  getTokenSecret(): string {
    this.loadConfig();
    return this.tokenSecret;
  }

  getMaxByteSize(): number {
    this.loadConfig();
    return this.maxBytes;
  }

  getTokenTtlSeconds(): number {
    this.loadConfig();
    return this.tokenTtlSeconds;
  }

  /**
   * Resolves the absolute disk path for a given (jobId, mediaId, extension)
   * tuple while guaranteeing the result stays under the configured media
   * root. Throws if the resolved path would escape the root.
   *
   * Path scheme matches docs/field-register-media-plan.md §4:
   *   <root>/<jobId>/<mediaId><ext>
   *
   * Job and media ids are uuid-shaped so they should never contain path
   * separators, but the check is defensive in case future inputs come from
   * less-trusted sources.
   */
  resolveBlobPath(jobId: string, mediaId: string, extension: string): string {
    this.loadConfig();
    if (!jobId || jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
      throw new Error('Invalid jobId for media path resolution.');
    }
    if (!mediaId || mediaId.includes('..') || mediaId.includes('/') || mediaId.includes('\\')) {
      throw new Error('Invalid mediaId for media path resolution.');
    }
    const safeExtension = extension && /^\.[A-Za-z0-9]{1,10}$/.test(extension) ? extension : '';
    const candidate = path.resolve(this.resolvedMediaRoot, jobId, `${mediaId}${safeExtension}`);
    if (!isPathUnderRoot(this.resolvedMediaRoot, candidate)) {
      throw new Error('Resolved media path escaped the configured media root.');
    }
    return candidate;
  }
}

function isPathUnderRoot(root: string, candidate: string): boolean {
  const normalizedRoot = root.endsWith(path.sep) ? root : root + path.sep;
  return candidate === root || candidate.startsWith(normalizedRoot);
}
