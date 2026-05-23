import type {
  AppointmentSummary,
  CustomerAccountSummary,
  JobSummary,
  JobsWorkspaceResponse,
  LocationSummary
} from '@bellfield/contracts';

/**
 * Dispatch board data model.
 *
 * Built entirely from JobsWorkspaceResponse to avoid duplicating job/appointment
 * business logic on the client. The dispatch board reads the same backend truth
 * the jobs/appointments panel already consumes.
 */

export type DispatchAppointmentCard = {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: JobSummary['status'];
  jobType: string;
  status: AppointmentSummary['status'];
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  locationId: string;
  locationName: string;
  locationCity?: string;
  locationState?: string;
  customerName: string;
  billToCustomerName: string;
  needsOfficeReview: boolean;
  finishOutcome?: AppointmentSummary['finishOutcome'];
};

export type DispatchTechnicianRow = {
  technicianId: string;
  technicianName: string;
  roleId: string;
  cards: DispatchAppointmentCard[];
};

export type DispatchBoardModel = {
  viewDate?: string;
  technicianRows: DispatchTechnicianRow[];
  unassignedQueue: DispatchAppointmentCard[];
  cardLookup: Map<string, DispatchAppointmentCard>;
};

export function buildDispatchBoardModel(
  workspace: JobsWorkspaceResponse,
  viewDate?: string
): DispatchBoardModel {
  const locationLookup = new Map<string, LocationSummary>();
  for (const location of workspace.locations) {
    locationLookup.set(location.id, location);
  }

  const customerLookup = new Map<string, CustomerAccountSummary>();
  for (const customer of workspace.customers) {
    customerLookup.set(customer.id, customer);
  }

  const cards: DispatchAppointmentCard[] = [];

  for (const job of workspace.jobs) {
    if (!isDispatchableJobStatus(job.status)) {
      continue;
    }

    for (const appointment of job.appointments) {
      if (appointment.status === 'cancelled') {
        continue;
      }

      if (viewDate && appointment.scheduledDate !== viewDate) {
        continue;
      }

      const location = locationLookup.get(job.locationId);
      const billToCustomer = customerLookup.get(job.billToCustomerId);
      const ownerCustomer = location ? customerLookup.get(location.customerId) : undefined;

      cards.push({
        appointmentId: appointment.id,
        jobId: job.id,
        jobNumber: job.jobNumber,
        jobSummary: job.summary,
        jobStatus: job.status,
        jobType: job.jobType,
        status: appointment.status,
        scheduledDate: appointment.scheduledDate,
        scheduledStartTime: appointment.scheduledStartTime,
        scheduledEndTime: appointment.scheduledEndTime,
        timeWindowLabel: appointment.timeWindowLabel,
        technicianId: appointment.technicianId,
        technicianName: appointment.technicianName,
        locationId: job.locationId,
        locationName: location?.name ?? job.locationName,
        locationCity: location?.city,
        locationState: location?.state,
        customerName: ownerCustomer?.name ?? location?.customerName ?? job.billToCustomerName,
        billToCustomerName: billToCustomer?.name ?? job.billToCustomerName,
        needsOfficeReview: appointment.needsOfficeReview || job.needsOfficeReview,
        finishOutcome: appointment.finishOutcome
      });
    }
  }

  const sortedCards = [...cards].sort(compareCardsForBoard);

  const technicianRows: DispatchTechnicianRow[] = workspace.technicians.map((technician) => ({
    technicianId: technician.id,
    technicianName: technician.displayName,
    roleId: technician.roleId,
    cards: sortedCards.filter((card) => card.technicianId === technician.id)
  }));

  const unassignedQueue = sortedCards.filter((card) => !card.technicianId);

  const cardLookup = new Map(sortedCards.map((card) => [card.appointmentId, card]));

  return {
    viewDate,
    technicianRows,
    unassignedQueue,
    cardLookup
  };
}

function isDispatchableJobStatus(status: JobSummary['status']): boolean {
  return status !== 'cancelled' && status !== 'closed';
}

function compareCardsForBoard(left: DispatchAppointmentCard, right: DispatchAppointmentCard): number {
  const leftDate = left.scheduledDate ?? '';
  const rightDate = right.scheduledDate ?? '';

  if (leftDate !== rightDate) {
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return leftDate.localeCompare(rightDate);
  }

  const leftStartTime = left.scheduledStartTime ?? '';
  const rightStartTime = right.scheduledStartTime ?? '';

  if (leftStartTime !== rightStartTime) {
    if (!leftStartTime) return 1;
    if (!rightStartTime) return -1;
    return leftStartTime.localeCompare(rightStartTime);
  }

  return left.jobNumber.localeCompare(right.jobNumber);
}
