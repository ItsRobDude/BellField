import { describe, expect, it } from 'vitest';
import {
  formatAddress,
  formatByteSize,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatMarginPercent,
  formatQuantity,
  formatTaxRatePercent,
  formatTime
} from './format';

describe('format', () => {
  it('formats money as US dollars whatever the browser locale is', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(-20)).toBe('-$20.00');
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('reads a plain yyyy-mm-dd as a local date so it never shifts a day', () => {
    expect(formatDate('2026-06-08')).toBe('Jun 8, 2026');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });

  it('formats timestamps as a date, a date and time, or a time in local time', () => {
    const noon = new Date(2026, 5, 8, 12, 5).toISOString();
    expect(formatDate(noon)).toBe('Jun 8, 2026');
    expect(formatDateTime(noon)).toBe('Jun 8, 2026, 12:05 PM');
    expect(formatTime(noon)).toBe('12:05 PM');
  });

  it('gives the fallback for an empty value and shows a non-date as it came', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined, 'Unknown')).toBe('Unknown');
    expect(formatDateTime('', 'Never')).toBe('Never');
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('trims quantities to four decimals and adds the unit when known', () => {
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(1.00005)).toBe('1.0001');
    expect(formatQuantity(3, 'ft')).toBe('3 ft');
  });

  it('formats basis-point rates and margins', () => {
    expect(formatTaxRatePercent(825)).toBe('8.25%');
    expect(formatTaxRatePercent(1000)).toBe('10%');
    expect(formatMarginPercent(1250)).toBe('12.5%');
    expect(formatMarginPercent(null)).toBe('—');
  });

  it('assembles a postal address from whichever parts exist', () => {
    expect(
      formatAddress({ addressLine1: '123 Main', city: 'Blaine', state: 'WA', postalCode: '98230' })
    ).toBe('123 Main, Blaine, WA 98230');
    expect(formatAddress({ city: 'Blaine', state: 'WA' })).toBe('Blaine, WA');
    expect(formatAddress({ addressLine1: ' 5 Elm ', postalCode: '98230' })).toBe('5 Elm, 98230');
    expect(formatAddress({})).toBe('');
  });

  it('formats byte sizes in the nearest unit', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(1536)).toBe('1.5 KB');
    expect(formatByteSize(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
