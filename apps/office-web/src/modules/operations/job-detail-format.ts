import type { JobSummary, MediaAttachmentSummary } from '@/lib/operations-api';
import { formatDate } from '@/lib/format';

// Display formatting shared by the job detail panel and its media section.

export function formatAppointmentReference(job: JobSummary, appointmentId: string): string {
  const appointment = job.appointments.find((candidate) => candidate.id === appointmentId);
  if (!appointment) {
    return 'Appointment';
  }
  return `${formatDate(appointment.scheduledDate, 'Unscheduled')} ${appointment.technicianName ?? 'Unassigned'}`;
}

export function formatMediaKind(kind: MediaAttachmentSummary['kind']): string {
  return kind[0].toUpperCase() + kind.slice(1);
}
