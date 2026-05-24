export class FieldMediaUploadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'FieldMediaUploadError';
  }
}

export function isFieldMediaUploadError(error: unknown): error is FieldMediaUploadError {
  return error instanceof FieldMediaUploadError;
}
