import type { EquipmentStatus } from './equipment.js';
import type { JobStatus, AppointmentStatus } from './jobs.js';

export interface DispatchEquipmentGlance {
  id: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  installDate?: string;
  status: EquipmentStatus;
}

export interface DispatchAppointmentSummary {
  appointmentId: string;
  jobId: string;
  jobNumber: string;
  jobSummary: string;
  jobStatus: JobStatus;
  jobType: string;
  workOrderNumber?: string;
  status: AppointmentStatus;
  scheduledDate: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  locationId: string;
  locationName: string;
  locationAddressLine1: string;
  locationCity: string;
  locationState: string;
  billToCustomerId: string;
  billToCustomerName: string;
  customerName: string;
  needsOfficeReview: boolean;
  equipment: DispatchEquipmentGlance[];
  equipmentCount: number;
}

export interface DispatchBoardResponse {
  startDate: string;
  endDate: string;
  technicians: Array<{
    id: string;
    displayName: string;
    roleId: string;
  }>;
  appointments: DispatchAppointmentSummary[];
}
