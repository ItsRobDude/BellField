export function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export function toOptionalDateString(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
}

export function toOptionalTimeString(value: string | Date | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  return value.slice(0, 5);
}

export function toTextArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
