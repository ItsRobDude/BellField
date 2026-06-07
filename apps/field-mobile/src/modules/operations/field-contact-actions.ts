import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { buildMapsUrl, buildPhoneUrl } from './field-contact-links';

export async function openPhoneNumber(phoneNumber: string): Promise<void> {
  const url = buildPhoneUrl(phoneNumber);

  if (url) {
    await Linking.openURL(url);
  }
}

export async function openAddressInMaps(address: string): Promise<void> {
  await Linking.openURL(buildMapsUrl(address, Platform.OS));
}
