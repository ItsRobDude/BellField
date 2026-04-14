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

export function toTextArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}
