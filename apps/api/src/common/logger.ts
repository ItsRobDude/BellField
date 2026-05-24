export type LogLevel = 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

const SENSITIVE_FIELD_TOKENS = [
  'password',
  'secret',
  'token',
  'key',
  'authorization',
  'cookie',
  'payload'
];

function isSensitiveField(name: string): boolean {
  const normalized = name.toLowerCase();
  return SENSITIVE_FIELD_TOKENS.some((token) => normalized.includes(token));
}

function sanitizeContext(context: LogContext | undefined): LogContext | undefined {
  if (!context) {
    return undefined;
  }

  const safeEntries = Object.entries(context).map(([key, value]) => {
    if (isSensitiveField(key)) {
      return [key, '[REDACTED]'] as const;
    }

    if (value instanceof Error) {
      return [key, { name: value.name, message: value.message }] as const;
    }

    if (typeof value === 'object' && value !== null) {
      return [key, '[OBJECT]'] as const;
    }

    return [key, value] as const;
  });

  return Object.fromEntries(safeEntries);
}

export function log(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: sanitizeContext(context)
  };

  // Keep this logger intentionally lightweight for now.
  // Future work: replace console transport with structured logging sinks.
  const line = JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
}
