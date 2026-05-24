import type { DispatchBoardResponse } from '@bellfield/contracts';

/**
 * Dispatch board data model.
 */

export type DispatchAppointmentCard = {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: DispatchBoardResponse['appointments'][number]['jobStatus'];
  jobType: string;
  status: DispatchBoardResponse['appointments'][number]['status'];
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  locationId: string;
  locationName: string;
  locationAddressLine1: string;
  locationCity?: string;
  locationState?: string;
  customerName: string;
  billToCustomerName: string;
  needsOfficeReview: boolean;
  equipment: DispatchBoardResponse['appointments'][number]['equipment'];
  equipmentCount: number;
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

export function buildDispatchBoardModel(dispatchBoard: DispatchBoardResponse): DispatchBoardModel {
  const sortedCards = dispatchBoard.appointments
    .filter(isDispatchableAppointment)
    .map(toDispatchAppointmentCard)
    .sort(compareCardsForBoard);

  const technicianRows: DispatchTechnicianRow[] = dispatchBoard.technicians.map((technician) => ({
    technicianId: technician.id,
    technicianName: technician.displayName,
    roleId: technician.roleId,
    cards: sortedCards.filter((card) => card.technicianId === technician.id)
  }));

  const unassignedQueue = sortedCards.filter((card) => !card.technicianId);

  const cardLookup = new Map(sortedCards.map((card) => [card.appointmentId, card]));

  return {
    viewDate:
      dispatchBoard.startDate === dispatchBoard.endDate ? dispatchBoard.startDate : undefined,
    technicianRows,
    unassignedQueue,
    cardLookup
  };
}

function toDispatchAppointmentCard(
  appointment: DispatchBoardResponse['appointments'][number]
): DispatchAppointmentCard {
  return {
    appointmentId: appointment.appointmentId,
    jobId: appointment.jobId,
    jobNumber: appointment.jobNumber,
    jobSummary: appointment.jobSummary,
    jobStatus: appointment.jobStatus,
    jobType: appointment.jobType,
    status: appointment.status,
    scheduledDate: appointment.scheduledDate,
    scheduledStartTime: appointment.scheduledStartTime,
    scheduledEndTime: appointment.scheduledEndTime,
    timeWindowLabel: appointment.timeWindowLabel,
    technicianId: appointment.technicianId,
    technicianName: appointment.technicianName,
    locationId: appointment.locationId,
    locationName: appointment.locationName,
    locationAddressLine1: appointment.locationAddressLine1,
    locationCity: appointment.locationCity,
    locationState: appointment.locationState,
    customerName: appointment.customerName,
    billToCustomerName: appointment.billToCustomerName,
    needsOfficeReview: appointment.needsOfficeReview,
    equipment: appointment.equipment,
    equipmentCount: appointment.equipmentCount
  };
}

function isDispatchableAppointment(
  appointment: DispatchBoardResponse['appointments'][number]
): boolean {
  return (
    appointment.status !== 'cancelled' &&
    appointment.jobStatus !== 'cancelled' &&
    appointment.jobStatus !== 'closed'
  );
}

function compareCardsForBoard(
  left: DispatchAppointmentCard,
  right: DispatchAppointmentCard
): number {
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
