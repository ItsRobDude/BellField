import { Logger } from '@nestjs/common';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { MediaConfigService } from './media-config.service';

const envKeys = [
  'NODE_ENV',
  'BELLFIELD_MEDIA_ROOT',
  'BELLFIELD_MEDIA_TOKEN_SECRET',
  'BELLFIELD_MEDIA_MAX_BYTES',
  'BELLFIELD_MEDIA_TOKEN_TTL_SECONDS'
] as const;

function createTempMediaRoot(): string {
  return mkdtempSync(path.join(tmpdir(), 'bellfield-media-config-spec-'));
}

function loadConfig(): MediaConfigService {
  const service = new MediaConfigService();
  service.onModuleInit();
  return service;
}

describe('MediaConfigService', () => {
  const original: Record<string, string | undefined> = {};
  const tempRoots: string[] = [];
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    for (const key of envKeys) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    warnSpy.mockRestore();
    for (const key of envKeys) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }

    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to start in production when the media root is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_MEDIA_TOKEN_SECRET = 'a'.repeat(32);

    expect(() => loadConfig()).toThrow(/BELLFIELD_MEDIA_ROOT/);
  });

  it('refuses to start in production when the media token secret is missing', () => {
    const mediaRoot = createTempMediaRoot();
    tempRoots.push(mediaRoot);

    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_MEDIA_ROOT = mediaRoot;

    expect(() => loadConfig()).toThrow(/BELLFIELD_MEDIA_TOKEN_SECRET/);
  });

  it('refuses to start in production when the media token secret is too short', () => {
    const mediaRoot = createTempMediaRoot();
    tempRoots.push(mediaRoot);

    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_MEDIA_ROOT = mediaRoot;
    process.env.BELLFIELD_MEDIA_TOKEN_SECRET = 'short-secret';

    expect(() => loadConfig()).toThrow(/too weak/);
  });

  it('refuses to start in production with the sample media token placeholder', () => {
    const mediaRoot = createTempMediaRoot();
    tempRoots.push(mediaRoot);

    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_MEDIA_ROOT = mediaRoot;
    process.env.BELLFIELD_MEDIA_TOKEN_SECRET = 'replace-with-a-long-random-secret';

    expect(() => loadConfig()).toThrow(/too weak/);
  });

  it('accepts explicit production media config', () => {
    const mediaRoot = createTempMediaRoot();
    const tokenSecret = 'prod-media-token-secret-32-chars-minimum';
    tempRoots.push(mediaRoot);

    process.env.NODE_ENV = 'production';
    process.env.BELLFIELD_MEDIA_ROOT = mediaRoot;
    process.env.BELLFIELD_MEDIA_TOKEN_SECRET = tokenSecret;
    process.env.BELLFIELD_MEDIA_MAX_BYTES = '12345';
    process.env.BELLFIELD_MEDIA_TOKEN_TTL_SECONDS = '120';

    const service = loadConfig();

    expect(service.getMediaRoot()).toBe(path.resolve(mediaRoot));
    expect(service.getTokenSecret()).toBe(tokenSecret);
    expect(service.getMaxByteSize()).toBe(12345);
    expect(service.getTokenTtlSeconds()).toBe(120);
  });

  it('uses dev fallbacks outside production', () => {
    process.env.NODE_ENV = 'test';

    const service = loadConfig();

    expect(service.getMediaRoot()).toBe(path.resolve(tmpdir(), 'bellfield-media-dev'));
    expect(service.getTokenSecret()).toBe(
      'bellfield-dev-media-token-secret-do-not-use-in-production'
    );
    expect(existsSync(service.getMediaRoot())).toBe(true);
  });
});
