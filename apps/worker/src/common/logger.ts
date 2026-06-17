export type WorkerLogContext = Record<string, unknown>;

function sanitizeContext(context: WorkerLogContext | undefined): WorkerLogContext | undefined {
  if (!context) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      const normalized = key.toLowerCase();

      if (
        normalized.includes('databaseurl') ||
        normalized.includes('password') ||
        normalized.includes('payload') ||
        normalized.includes('token') ||
        normalized.includes('secret') ||
        normalized.includes('credential')
      ) {
        return [key, '[REDACTED]'];
      }

      if (typeof value === 'object' && value !== null) {
        return [key, '[OBJECT]'];
      }

      return [key, value];
    })
  );
}

export function workerLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: WorkerLogContext
): void {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'worker',
    level,
    message,
    context: sanitizeContext(context)
  });

  // Future structured logging can swap this console transport for external sinks.
  if (level === 'error') {
    console.error(entry);
    return;
  }
  if (level === 'warn') {
    console.warn(entry);
    return;
  }

  console.info(entry);
}
