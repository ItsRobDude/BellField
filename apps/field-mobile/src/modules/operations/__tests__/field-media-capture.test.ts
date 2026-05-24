import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fileSystemMock = vi.hoisted(() => ({
  documentDirectory: 'file:///app/Documents/',
  EncodingType: { Base64: 'base64' },
  makeDirectoryAsync: vi.fn(),
  copyAsync: vi.fn(),
  getInfoAsync: vi.fn(),
  readAsStringAsync: vi.fn()
}));

const cryptoMock = vi.hoisted(() => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: vi.fn()
}));

const imagePickerMock = vi.hoisted(() => ({
  UIImagePickerControllerQualityType: { Medium: 1 },
  requestCameraPermissionsAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
  launchCameraAsync: vi.fn(),
  launchImageLibraryAsync: vi.fn()
}));

vi.mock('expo-file-system', () => fileSystemMock);
vi.mock('expo-crypto', () => cryptoMock);
vi.mock('expo-image-picker', () => imagePickerMock);

// eslint-disable-next-line import/first -- Expo modules must be mocked before loading the capture helper.
import { pickFieldMedia } from '../field-media-capture';

describe('pickFieldMedia', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
    vi.clearAllMocks();

    fileSystemMock.documentDirectory = 'file:///app/Documents/';
    fileSystemMock.makeDirectoryAsync.mockResolvedValue(undefined);
    fileSystemMock.copyAsync.mockResolvedValue(undefined);
    fileSystemMock.getInfoAsync.mockResolvedValue({
      exists: true,
      uri: 'file:///app/Documents/bellfield-media/media-1.jpg',
      isDirectory: false,
      size: 5,
      modificationTime: 0
    });
    fileSystemMock.readAsStringAsync.mockResolvedValue('AQIDBAU=');
    cryptoMock.digest.mockResolvedValue(new Uint8Array([1, 35, 255]).buffer);
    imagePickerMock.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
    imagePickerMock.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('captures media, copies it into app-owned storage, and computes sha256 from staged bytes', async () => {
    imagePickerMock.launchCameraAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///camera/photo.jpg',
          fileName: 'photo.jpg',
          mimeType: 'image/jpeg',
          fileSize: 5,
          width: 100,
          height: 100,
          type: 'image'
        }
      ]
    });

    const result = await pickFieldMedia('camera');

    expect(result).toMatchObject({
      originalFilename: 'photo.jpg',
      mediaKind: 'image',
      contentType: 'image/jpeg',
      byteSize: 5,
      sha256: '0123ff',
      capturedAt: '2026-05-23T12:00:00.000Z'
    });
    expect(result?.localUri).toContain('file:///app/Documents/bellfield-media/media-');
    expect(fileSystemMock.makeDirectoryAsync).toHaveBeenCalledWith('file:///app/Documents/bellfield-media/', {
      intermediates: true
    });
    expect(fileSystemMock.copyAsync).toHaveBeenCalledWith({
      from: 'file:///camera/photo.jpg',
      to: result?.localUri
    });
    expect(fileSystemMock.readAsStringAsync).toHaveBeenCalledWith(result?.localUri, { encoding: 'base64' });
    expect(cryptoMock.digest).toHaveBeenCalledWith('SHA-256', new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('returns null when the picker is cancelled', async () => {
    imagePickerMock.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });

    await expect(pickFieldMedia('library')).resolves.toBeNull();
  });
});
