import type { JobSummary, MediaAttachmentSummary } from '@/lib/operations-api';

// Display formatting shared by the job detail panel and its extracted sections. Lifted out of
// job-detail-panel.tsx unchanged; the app-wide formatter consolidation is tracked separately
// (docs/fsm-gap-analysis-2026-07-14.md, "one format.ts").

export function formatAppointmentReference(job: JobSummary, appointmentId: string): string {
  const appointment = job.appointments.find((candidate) => candidate.id === appointmentId);
  if (!appointment) {
    return 'Appointment';
  }
  return `${appointment.scheduledDate ?? 'Unscheduled'} ${appointment.technicianName ?? 'Unassigned'}`;
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function formatQuantity(quantity: number, unitOfMeasure?: string): string {
  return `${quantity}${unitOfMeasure ? ` ${unitOfMeasure}` : ''}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(amount);
}

export function formatByteSize(byteSize: number): string {
  if (byteSize < 1024) {
    return `${byteSize} B`;
  }
  if (byteSize < 1024 * 1024) {
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

export function formatMediaKind(kind: MediaAttachmentSummary['kind']): string {
  return kind[0].toUpperCase() + kind.slice(1);
}
