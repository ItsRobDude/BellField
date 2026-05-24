import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import {
  arrayBufferToHex,
  base64ToBytes,
  buildLocalMediaUri,
  normalizePickedFieldMediaAsset,
  type PickedFieldMediaAsset,
  type StagedFieldMedia
} from './field-media-files';

export type FieldMediaSource = 'camera' | 'library';

export async function pickFieldMedia(source: FieldMediaSource): Promise<StagedFieldMedia | null> {
  const result = source === 'camera' ? await launchCameraPicker() : await launchLibraryPicker();

  if (result.canceled || !result.assets[0]) {
    return null;
  }

  return stagePickedFieldMediaAsset(result.assets[0]);
}

export async function stagePickedFieldMediaAsset(asset: PickedFieldMediaAsset): Promise<StagedFieldMedia> {
  const baseDirectory = FileSystem.documentDirectory;

  if (!baseDirectory) {
    throw new Error('BellField could not access app-owned document storage for media.');
  }

  const localMediaId = `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const capturedAt = new Date().toISOString();
  const normalizedAsset = normalizePickedFieldMediaAsset(asset, localMediaId, capturedAt);
  const localUri = buildLocalMediaUri(baseDirectory, localMediaId, normalizedAsset.originalFilename);
  const mediaDirectory = `${baseDirectory.endsWith('/') ? baseDirectory : `${baseDirectory}/`}bellfield-media/`;

  await FileSystem.makeDirectoryAsync(mediaDirectory, { intermediates: true });
  await FileSystem.copyAsync({ from: asset.uri, to: localUri });

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (!fileInfo.exists || fileInfo.isDirectory) {
    throw new Error('BellField could not stage the selected media file.');
  }

  const base64Contents = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64
  });
  const bytes = base64ToBytes(base64Contents);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);

  return {
    ...normalizedAsset,
    localUri,
    byteSize: fileInfo.size,
    sha256: arrayBufferToHex(digest)
  };
}

async function launchCameraPicker(): Promise<ImagePicker.ImagePickerResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is required to capture BellField job media.');
  }

  return ImagePicker.launchCameraAsync({
    mediaTypes: ['images', 'videos'],
    quality: 0.9,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium
  });
}

async function launchLibraryPicker(): Promise<ImagePicker.ImagePickerResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library access is required to attach BellField job media.');
  }

  return ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: false,
    quality: 0.9,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium
  });
}
