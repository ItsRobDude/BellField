import { describe, expect, it } from 'vitest';
import { buildMapsUrl, buildPhoneUrl } from '../field-contact-links';

describe('field contact actions', () => {
  it('builds dialable phone URLs without guessing a preferred number', () => {
    expect(buildPhoneUrl('(509) 555-0100')).toBe('tel:5095550100');
    expect(buildPhoneUrl('+1 509 555 0100')).toBe('tel:+15095550100');
    expect(buildPhoneUrl('   ')).toBeUndefined();
  });

  it('builds direct platform map URLs for a service address', () => {
    const address = '123 Main St, Blaine, WA 98230';

    expect(buildMapsUrl(address, 'ios')).toBe(
      'http://maps.apple.com/?q=123%20Main%20St%2C%20Blaine%2C%20WA%2098230'
    );
    expect(buildMapsUrl(address, 'android')).toBe(
      'geo:0,0?q=123%20Main%20St%2C%20Blaine%2C%20WA%2098230'
    );
    expect(buildMapsUrl(address, 'web')).toBe(
      'https://www.google.com/maps/search/?api=1&query=123%20Main%20St%2C%20Blaine%2C%20WA%2098230'
    );
  });
});
