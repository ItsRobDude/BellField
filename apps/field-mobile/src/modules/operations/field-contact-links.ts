export type FieldMapPlatform = 'android' | 'ios' | 'macos' | 'web' | 'windows';

export function buildPhoneUrl(phoneNumber: string): string | undefined {
  const dialable = phoneNumber.trim().replace(/[^\d+*#,;]/g, '');

  return dialable ? `tel:${dialable}` : undefined;
}

export function buildMapsUrl(address: string, platform: FieldMapPlatform): string {
  const encodedAddress = encodeURIComponent(address);

  if (platform === 'ios') {
    return `http://maps.apple.com/?q=${encodedAddress}`;
  }

  if (platform === 'android') {
    return `geo:0,0?q=${encodedAddress}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
}
