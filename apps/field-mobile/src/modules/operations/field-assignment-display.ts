/**
 * Renders the assignment label for an appointment from the technician's point of view.
 *
 * The field assigned-work feed can include appointments under an assigned job that
 * are themselves assigned to other technicians (or unassigned). A naive fallback to
 * the current employee's display name would mislead the technician into thinking
 * every appointment is theirs. This helper keeps the label honest:
 *
 *   - prefer the resolved technicianName from the snapshot
 *   - if no name resolved but the technicianId is the current employee, show "You"
 *   - if technicianId is set but unresolved (rare), show "Another technician"
 *   - if no technicianId at all, show "Unassigned"
 */

export type AppointmentAssignmentLike = {
  technicianId?: string;
  technicianName?: string;
};

export function describeAppointmentAssignment(
  appointment: AppointmentAssignmentLike,
  currentEmployeeId: string
): string {
  if (appointment.technicianName) {
    return appointment.technicianName;
  }

  if (!appointment.technicianId) {
    return 'Unassigned';
  }

  if (appointment.technicianId === currentEmployeeId) {
    return 'You';
  }

  return 'Another technician';
}

/**
 * Whether the current technician is the active owner of this appointment.
 * Useful for surfacing "this is yours" vs "this belongs to a teammate" UX cues.
 */
export function isAppointmentAssignedToCurrentTechnician(
  appointment: Pick<AppointmentAssignmentLike, 'technicianId'>,
  currentEmployeeId: string
): boolean {
  return appointment.technicianId === currentEmployeeId;
}
