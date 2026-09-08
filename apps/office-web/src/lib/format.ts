// Display formatting for the office app. The office renders US English and US dollars, and the
// locale is fixed here rather than read from the browser so two office PCs never show the same
// number two ways. Dates and times use the PC's own time zone, which is the shop's local time.

const officeLocale = 'en-US';

const currencyFormatter = new Intl.NumberFormat(officeLocale, {
  style: 'currency',
  currency: 'USD'
});

const dateFormatter = new Intl.DateTimeFormat(officeLocale, {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
});

const dateTimeFormatter = new Intl.DateTimeFormat(officeLocale, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit'
});

const timeFormatter = new Intl.DateTimeFormat(officeLocale, {
  hour: 'numeric',
  minute: '2-digit'
});

/** "$1,234.50" */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/**
 * A calendar date, "Jun 8, 2026". Accepts an ISO timestamp or a plain yyyy-mm-dd; a plain
 * date is read as a local date so it never shifts a day in a negative-offset time zone.
 * An empty value gives `fallback`; a value that is not a date is shown as it came.
 */
export function formatDate(value: string | null | undefined, fallback = ''): string {
  return formatWith(dateFormatter, value, fallback);
}

/** A date and clock time, "Jun 8, 2026, 6:00 PM". Same input rules as `formatDate`. */
export function formatDateTime(value: string | null | undefined, fallback = ''): string {
  return formatWith(dateTimeFormatter, value, fallback);
}

/** A clock time only, "6:00 PM". Same input rules as `formatDate`. */
export function formatTime(value: string | null | undefined, fallback = ''): string {
  return formatWith(timeFormatter, value, fallback);
}

/**
 * Quantities are stored at 4-decimal precision: show up to 4 decimals without trailing
 * zeros, followed by the unit when one is known ("2.5 ft").
 */
export function formatQuantity(quantity: number, unitOfMeasure?: string): string {
  const amount = Number(quantity.toFixed(4)).toString();
  return unitOfMeasure ? `${amount} ${unitOfMeasure}` : amount;
}

/** A tax rate stored in basis points, "8.25%". */
export function formatTaxRatePercent(basisPoints: number): string {
  return `${Number((basisPoints / 100).toFixed(2))}%`;
}

/** A margin stored in basis points, "12.5%", or a dash when there is no margin to show. */
export function formatMarginPercent(marginBasisPoints: number | null | undefined): string {
  if (marginBasisPoints === null || marginBasisPoints === undefined) {
    return '—';
  }
  return `${(marginBasisPoints / 100).toFixed(1)}%`;
}

/** "123 Main St, Blaine, WA 98230", skipping whichever parts are blank. */
export function formatAddress(place: {
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): string {
  const cityState = [place.city, place.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  const tail = [cityState, place.postalCode?.trim()].filter(Boolean).join(' ');
  return [place.addressLine1?.trim(), tail].filter(Boolean).join(', ');
}

/** "512 B", "1.5 KB", "2.0 MB" */
export function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function formatWith(
  formatter: Intl.DateTimeFormat,
  value: string | null | undefined,
  fallback: string
): string {
  if (!value) {
    return fallback;
  }

  const date = parseDateValue(value);
  return date ? formatter.format(date) : value;
}

function parseDateValue(value: string): Date | null {
  const plainDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plainDate) {
    return new Date(Number(plainDate[1]), Number(plainDate[2]) - 1, Number(plainDate[3]));
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
