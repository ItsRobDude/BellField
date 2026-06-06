/** Trigger a browser download of a Blob (e.g. a server-rendered CSV export). No-op outside the
 * browser. Shared by the report export buttons. */
export function downloadBlob(filename: string, blob: Blob): void {
  if (typeof document === 'undefined') {
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
