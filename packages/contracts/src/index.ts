export interface HealthStatus {
  status: 'ok';
  timestamp: string;
}

export interface VersionInfo {
  name: string;
  version: string;
}

export type EmployeeRoleId =
  | 'owner'
  | 'admin'
  | 'csr'
  | 'dispatcher'
  | 'bookKeeping'
  | 'technician';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'post' | 'export' | 'configure';

export type PermissionArea =
  | 'customers'
  | 'locations'
  | 'contacts'
  | 'equipment'
  | 'jobs'
  | 'appointmentsDispatch'
  | 'estimates'
  | 'invoices'
  | 'payments'
  | 'purchasing'
  | 'inventory'
  | 'reports'
  | 'employeesPermissions'
  | 'companySettings'
  | 'supportLogsBackups';

export type PermissionKey = `${PermissionArea}:${PermissionAction}`;

export interface RoleTemplate {
  id: EmployeeRoleId;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export interface EmployeePermissionOverrides {
  grantedPermissions: PermissionKey[];
  revokedPermissions: PermissionKey[];
}

export interface EmployeeSummary {
  id: string;
  email: string;
  displayName: string;
  roleId: EmployeeRoleId;
  roleName: string;
  isActive: boolean;
  effectivePermissions: PermissionKey[];
  permissionOverrides: EmployeePermissionOverrides;
}

export interface LoginRequest {
  email: string;
  password: string;
  surface: 'office-web' | 'field-mobile';
  deviceLabel?: string;
}

export interface LoginResponse {
  sessionToken: string;
  employee: EmployeeSummary;
}

export interface CurrentSessionResponse {
  employee: EmployeeSummary;
}

export interface EmployeeListResponse {
  employees: EmployeeSummary[];
}

export interface RoleTemplateListResponse {
  roles: RoleTemplate[];
}

export interface UpdateEmployeeRequest {
  roleId?: EmployeeRoleId;
  isActive?: boolean;
  grantedPermissions?: PermissionKey[];
  revokedPermissions?: PermissionKey[];
}

export interface CustomerAccountSummary {
  id: string;
  name: string;
  accountType: string;
  phone?: string;
  email?: string;
  flags: string[];
}

export interface ContactSummary {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  tags: string[];
}

export interface LocationSummary {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  contacts: ContactSummary[];
  alternateBillToCustomerIds: string[];
}

export type EquipmentStatus = 'active' | 'inactive' | 'pendingInstall';

export interface EquipmentSummary {
  id: string;
  locationId?: string;
  locationName?: string;
  customerName?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status: EquipmentStatus;
  notes: string;
  updatedAt: string;
}

export interface EquipmentWorkspaceResponse {
  locations: Array<{
    id: string;
    name: string;
    customerId: string;
    customerName: string;
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    contactNames: string[];
  }>;
  equipment: EquipmentSummary[];
}

export interface CreateEquipmentRequest {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  status: EquipmentStatus;
  notes?: string;
}

export type UpdateEquipmentRequest = Partial<CreateEquipmentRequest>;

export interface UpdateEquipmentFieldRequest extends UpdateEquipmentRequest {
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface EquipmentMutationResponse extends EquipmentSummary {
  syncResult?: SyncResult;
}

export type JobStatus = 'open' | 'closed' | 'posted' | 'cancelled';

export type AppointmentStatus =
  | 'assigned'
  | 'confirmed'
  | 'onTheWay'
  | 'arrived'
  | 'working'
  | 'finished'
  | 'noAnswer'
  | 'cancelled';

export interface SyncResult {
  status: 'applied' | 'conflict' | 'rejected' | 'retryableFailure';
  message?: string;
}

export type FieldSyncSource = 'field-save-queue';

export interface AppointmentSummary {
  id: string;
  jobId: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface JobTimelineEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  kind: string;
  message: string;
}

export interface JobSummary {
  id: string;
  jobNumber: string;
  locationId: string;
  locationName: string;
  billToCustomerId: string;
  billToCustomerName: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  status: JobStatus;
  workOrderNumber?: string;
  appointments: AppointmentSummary[];
  timeline: JobTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface JobsWorkspaceResponse {
  customers: CustomerAccountSummary[];
  locations: LocationSummary[];
  technicians: Array<{
    id: string;
    displayName: string;
    roleId: string;
  }>;
  jobs: JobSummary[];
}

export interface CreateJobRequest {
  locationId: string;
  billToCustomerId?: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  workOrderNumber?: string;
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
}

export interface UpdateJobStatusRequest {
  status: JobStatus;
  occurredAt?: string;
}

export interface UpdateJobStatusResponse extends JobSummary {
  warningMessages?: string[];
}

export interface CreateAppointmentRequest {
  scheduledDate?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface AddJobNoteRequest {
  note: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface JobMutationResponse extends JobSummary {
  syncResult?: SyncResult;
}

export interface FieldAssignedWorkResponse {
  jobs: JobSummary[];
  locations: LocationSummary[];
  customers: CustomerAccountSummary[];
  equipment: Array<{
    id: string;
    locationId?: string;
    equipmentType: string;
    brand: string;
    model: string;
    serialNumber: string;
    filterSizes: string[];
    equipmentLocationDescription?: string;
    installDate?: string;
    status: EquipmentStatus;
    notes: string;
    updatedAt: string;
  }>;
  serverTime: string;
  snapshotVersion: string;
  windowStartDate: string;
  windowEndDate: string;
}
