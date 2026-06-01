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

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'post'
  | 'export'
  | 'configure';

export type PermissionArea =
  | 'customers'
  | 'locations'
  | 'contacts'
  | 'equipment'
  | 'jobs'
  | 'appointmentsDispatch'
  | 'register'
  | 'media'
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
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  isActive: boolean;
  flags: string[];
}

export interface ContactSummary {
  id: string;
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
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
  phone?: string;
  email?: string;
  fax?: string;
  isActive: boolean;
  contacts: ContactLink[];
  alternateBillToCustomerIds: string[];
}

export interface CustomerLocationListItem {
  id: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  isActive: boolean;
}

export interface LinkedRecordSummary {
  id: string;
  kind: 'customer' | 'location';
  name: string;
  subtitle: string;
}

export interface ContactLink {
  id: string;
  contactId: string;
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags: string[];
  isActive: boolean;
  endDate?: string;
  hasOverrides: boolean;
  sharedContact: ContactSummary;
  linkedRecord: LinkedRecordSummary;
}

export interface OwnershipHistoryEntry {
  id: string;
  customerId: string;
  customerName: string;
  startedAt: string;
  endedAt?: string;
  note?: string;
}

export interface DuplicateCandidate {
  id: string;
  kind: 'customer' | 'location';
  title: string;
  subtitle: string;
  matchReasons: string[];
  isActive: boolean;
  hasDoNotServiceFlag: boolean;
}

export interface CustomerDetail extends CustomerAccountSummary {
  contacts: ContactLink[];
  locations: CustomerLocationListItem[];
}

export interface LocationDetail extends LocationSummary {
  ownershipHistory: OwnershipHistoryEntry[];
}

export interface ContactDetail extends ContactSummary {
  linkedRecords: ContactLink[];
}

export interface CrmSearchResult {
  id: string;
  kind: 'customer' | 'location' | 'contact';
  title: string;
  subtitle: string;
  badges: string[];
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customerId?: string;
  customerName?: string;
  isActive: boolean;
}

export interface CrmSearchResponse {
  query: string;
  results: CrmSearchResult[];
}

export interface CrmWorkspaceResponse {
  customers: CustomerAccountSummary[];
  contacts: ContactSummary[];
  locations: CustomerLocationListItem[];
}

export interface CreateCustomerRequest {
  name: string;
  accountType: string;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  flags?: string[];
  confirmDuplicate?: boolean;
}

export type UpdateCustomerRequest = Partial<Omit<CreateCustomerRequest, 'confirmDuplicate'>> & {
  isActive?: boolean;
  confirmDuplicate?: boolean;
};

export interface CustomerMutationResponse {
  customer: CustomerDetail;
  duplicateWarnings?: DuplicateCandidate[];
}

export interface CreateLocationRequest {
  customerId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone?: string;
  email?: string;
  fax?: string;
  alternateBillToCustomerIds?: string[];
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
}

export type UpdateLocationRequest = Partial<
  Omit<CreateLocationRequest, 'customerId' | 'confirmDuplicate' | 'confirmMissingContactInfo'>
> & {
  isActive?: boolean;
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
};

export interface ReassignLocationOwnerRequest {
  customerId: string;
  note?: string;
}

export interface LocationMutationResponse {
  location: LocationDetail;
  duplicateWarnings?: DuplicateCandidate[];
}

export interface CreateContactRequest {
  displayName: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags?: string[];
}

export type ContactUpdateScope = 'global' | 'link';

export interface UpdateContactRequest {
  displayName?: string;
  phone?: string;
  email?: string;
  fax?: string;
  tags?: string[];
  scope: ContactUpdateScope;
  linkId?: string;
}

export interface ContactMutationResponse {
  contact: ContactDetail;
}

export interface LinkContactRequest {
  contactId: string;
  customerId?: string;
  locationId?: string;
  tags?: string[];
}

export interface UpdateContactLinkRequest {
  tags?: string[];
  endDate?: string;
  isActive?: boolean;
}

export type EquipmentStatus = 'active' | 'inactive' | 'pendingInstall' | 'removed';

export interface EquipmentGroupSummary {
  id: string;
  name: string;
}

export interface EquipmentLinkedSummary {
  id: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
}

export interface EquipmentHistoryEntry {
  id: string;
  occurredAt: string;
  actorName: string;
  kind:
    | 'created'
    | 'edited'
    | 'statusChanged'
    | 'placementChanged'
    | 'grouped'
    | 'ungrouped'
    | 'markedReplaced'
    | 'replacementLinkChanged';
  message: string;
}

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
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  status: EquipmentStatus;
  ageYears?: number;
  ageLabel?: string;
  systemGroup?: EquipmentGroupSummary;
  replacesEquipmentId?: string;
  replacedByEquipmentId?: string;
  notes: string;
  updatedAt: string;
}

export interface EquipmentDetail extends EquipmentSummary {
  history: EquipmentHistoryEntry[];
  replacesEquipment?: EquipmentLinkedSummary;
  replacedByEquipment?: EquipmentLinkedSummary;
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
  suggestedEquipmentTypes: string[];
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
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupName?: string;
  status: EquipmentStatus;
  notes?: string;
  confirmMissingSerial?: boolean;
}

export type UpdateEquipmentRequest = Partial<CreateEquipmentRequest>;

export interface UpdateEquipmentFieldRequest extends UpdateEquipmentRequest {
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface LinkEquipmentReplacementRequest {
  replacementEquipmentId: string;
}

export interface EquipmentDeleteResponse {
  deletedEquipmentId: string;
}

export interface EquipmentMutationResponse {
  equipment: EquipmentDetail;
  warningMessages?: string[];
  syncResult?: SyncResult;
}

export type JobStatus =
  | 'new'
  | 'scheduled'
  | 'inProgress'
  | 'waitingOnParts'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'dispatched'
  | 'onTheWay'
  | 'arrived'
  | 'working'
  | 'finished'
  | 'noAnswer'
  | 'cancelled';

export type AppointmentFinishOutcome = 'completed' | 'followUpNeeded' | 'noAccess';
export type FinishedVisitReviewDecision = 'keptOpen' | 'followUpScheduled';
export type RegisterEntryKind = 'labor' | 'serviceItem' | 'part' | 'membership' | 'other';
// Estimate lines add 'equipment' to the register kinds: estimates routinely quote
// replacement equipment, which captured field work does not.
export type EstimateLineItemKind =
  | 'labor'
  | 'serviceItem'
  | 'part'
  | 'equipment'
  | 'membership'
  | 'other';
// v1 estimate lifecycle (docs/data-modeling-rules.md): pending -> approved | declined.
// No 'sent'/'expired' yet; approval does not auto-create downstream records.
export type EstimateStatus = 'pending' | 'approved' | 'declined';
export type EstimateDiscountKind = 'percent' | 'fixed';
export type MediaAttachmentKind = 'image' | 'video' | 'document';
export type MediaSignedTokenScope = 'upload' | 'download';

export interface SyncResult {
  status: 'applied' | 'conflict' | 'rejected' | 'retryableFailure';
  message?: string;
}

export type FieldSyncSource = 'field-save-queue';

export interface AppointmentSummary {
  id: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
  finishedReviewedAt?: string;
  finishedReviewedBy?: string;
  finishedReviewDecision?: FinishedVisitReviewDecision;
  needsOfficeReview: boolean;
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

export interface RegisterEntrySummary {
  id: string;
  jobId: string;
  appointmentId?: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  totalAmount: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateLineItemSummary {
  id: string;
  estimateId: string;
  /** Stable display order within the estimate, starting at 0. */
  position: number;
  kind: EstimateLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  /** Customer-facing sell price per unit (dollars). Always present on a line. */
  unitPrice: number;
  /** Internal cost per unit (dollars). Optional; absence makes the estimate's margin a ceiling. */
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  /** Snapshotted engine output for this line. */
  lineSubtotal: number;
  lineCost?: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Optional whole-estimate discount. `percent` uses basisPoints (1000 = 10%);
 * `fixed` uses amount (dollars). Mirrors the @bellfield/estimating engine input.
 */
export type EstimateDiscount =
  | { kind: 'percent'; basisPoints: number }
  | { kind: 'fixed'; amount: number };

/** Snapshotted pricing totals (dollars) produced by the shared estimating engine. */
export interface EstimateTotals {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  /** Null when there is no positive price to express a margin against. */
  marginBasisPoints: number | null;
  /** False when at least one line lacks a cost, so profit/margin are an optimistic ceiling. */
  costComplete: boolean;
}

export interface EstimateSummary {
  id: string;
  jobId: string;
  status: EstimateStatus;
  title: string;
  description?: string;
  taxRateBasisPoints: number;
  discount?: EstimateDiscount;
  validUntil?: string;
  lineItems: EstimateLineItemSummary[];
  totals: EstimateTotals;
  approvedAt?: string;
  approvedByEmployeeId?: string;
  approvedByName?: string;
  declinedAt?: string;
  declinedByEmployeeId?: string;
  declinedByName?: string;
  /** Set when this estimate was cloned from an earlier one to revise it. */
  sourceEstimateId?: string;
  /** Set on an older estimate that a newer one has replaced. */
  supersededByEstimateId?: string;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// --- Invoices (Milestone 7, draft stage) ---------------------------------------

export type InvoiceStatus = 'draft' | 'posted';
export type InvoiceKind = 'main';
export type InvoiceLineItemKind = EstimateLineItemKind;
/** Where an invoice line came from. Manual office entry, reflected register work, or a converted estimate. */
export type InvoiceLineSourceKind = 'manual' | 'register' | 'estimate';
/** Whether an invoice line still mirrors its source (linked) or was hand-edited by office (detached). */
export type InvoiceLineSourceSyncState = 'linked' | 'detached';

export interface InvoiceLineItemSummary {
  id: string;
  invoiceId: string;
  position: number;
  kind: InvoiceLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
  lineSubtotal: number;
  lineCost?: number;
  sourceKind: InvoiceLineSourceKind;
  sourceSyncState: InvoiceLineSourceSyncState;
  createdAt: string;
  updatedAt: string;
}

/** Snapshotted invoice totals (dollars), same shape and engine source as estimate totals. */
export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  taxableBase: number;
  tax: number;
  total: number;
  totalCost: number;
  profit: number;
  marginBasisPoints: number | null;
  costComplete: boolean;
}

export interface InvoiceSummary {
  id: string;
  jobId: string;
  invoiceKind: InvoiceKind;
  status: InvoiceStatus;
  taxRateBasisPoints: number;
  discount?: EstimateDiscount;
  lineItems: InvoiceLineItemSummary[];
  totals: InvoiceTotals;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface InvoiceResponse {
  invoice: InvoiceSummary;
}

export interface MediaAttachmentSummary {
  id: string;
  jobId: string;
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedByEmployeeId: string;
  capturedByName: string;
  capturedAt: string;
  /** True once the blob bytes have been uploaded to the server. */
  uploadCompleted: boolean;
  uploadedAt?: string;
  isVoid: boolean;
  voidReason?: string;
  createdAt: string;
  updatedAt: string;
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
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  appointments: AppointmentSummary[];
  registerEntries?: RegisterEntrySummary[];
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

export interface JobIntakeContextResponse {
  technicians: JobsWorkspaceResponse['technicians'];
}

export interface JobDetailResponse {
  job: JobSummary;
  location: LocationSummary;
  billToCustomer: CustomerAccountSummary;
  technicians: JobsWorkspaceResponse['technicians'];
  equipment: EquipmentSummary[];
  registerEntries: RegisterEntrySummary[];
  mediaAttachments: MediaAttachmentSummary[];
  timelineLimit: number;
  timelineHasMore: boolean;
}

export type JobsQueueKey = 'review' | 'waitingOnParts' | 'unscheduled' | 'open';

export interface JobsQueueAppointmentSummary {
  id: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  technicianName?: string;
  status: AppointmentStatus;
  needsOfficeReview: boolean;
}

export interface JobsQueueItem {
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
  needsScheduling: boolean;
  needsOfficeReview: boolean;
  nextAppointment?: JobsQueueAppointmentSummary;
  createdAt: string;
  updatedAt: string;
}

export interface JobsQueueSection {
  key: JobsQueueKey;
  totalCount: number;
  jobs: JobsQueueItem[];
  nextCursor?: string;
}

export interface JobsQueueResponse {
  limit: number;
  queues: JobsQueueSection[];
}

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

export interface CreateJobRequest {
  locationId: string;
  billToCustomerId?: string;
  jobType: string;
  category: string;
  origin: string;
  summary: string;
  workOrderNumber?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
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
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
}

export interface UpdateAppointmentScheduleRequest {
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
  occurredAt?: string;
}

export interface UpdateAppointmentStatusRequest {
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
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

export interface RegisterEntriesResponse {
  registerEntries: RegisterEntrySummary[];
}

export interface CreateRegisterEntryRequest {
  appointmentId?: string;
  kind: RegisterEntryKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice?: number;
  totalAmount: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface UpdateRegisterEntryRequest {
  appointmentId?: string | null;
  kind?: RegisterEntryKind;
  description?: string;
  quantity?: number;
  unitOfMeasure?: string;
  unitPrice?: number | null;
  totalAmount?: number;
  partNumber?: string;
  inventorySourceLabel?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

export interface VoidRegisterEntryRequest {
  reason?: string;
  occurredAt?: string;
  baseUpdatedAt?: string;
  syncSource?: FieldSyncSource;
}

/**
 * A line as supplied by the client when creating or replacing an estimate. The
 * server assigns ids and positions (by array order) and computes all snapshot
 * totals via the shared engine — clients never send computed amounts.
 */
export interface EstimateLineItemInput {
  kind: EstimateLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
  partNumber?: string;
  inventorySourceLabel?: string;
}

export interface EstimatesResponse {
  estimates: EstimateSummary[];
}

export interface EstimateResponse {
  estimate: EstimateSummary;
}

export interface CreateEstimateRequest {
  title: string;
  description?: string;
  taxRateBasisPoints?: number;
  discount?: EstimateDiscount;
  validUntil?: string;
  lineItems: EstimateLineItemInput[];
}

/** Whole-estimate replacement; only permitted while the estimate is pending. */
export interface UpdateEstimateRequest {
  title?: string;
  description?: string;
  taxRateBasisPoints?: number;
  discount?: EstimateDiscount | null;
  validUntil?: string | null;
  lineItems?: EstimateLineItemInput[];
}

export interface DeclineEstimateRequest {
  reason?: string;
}

export interface MediaAttachmentsResponse {
  mediaAttachments: MediaAttachmentSummary[];
}

export interface MediaAttachmentResponse {
  mediaAttachment: MediaAttachmentSummary;
}

export interface CreateMediaUploadIntentRequest {
  appointmentId?: string;
  kind: MediaAttachmentKind;
  contentType: string;
  byteSize: number;
  sha256: string;
  originalFilename: string;
  caption?: string;
  capturedAt?: string;
}

export interface CreateMediaUploadIntentResponse {
  mediaAttachment: MediaAttachmentSummary;
  /** True when an existing media row with the same (jobId, sha256) already had bytes uploaded. */
  uploadCompleted: boolean;
  /** Short-lived HMAC token the caller must present to POST /operations/media/:id/blob. Absent when uploadCompleted is true. */
  uploadToken?: string;
  /** ISO timestamp marking when the upload token expires. Absent when uploadCompleted is true. */
  uploadTokenExpiresAt?: string;
  /** Maximum byte size the server will accept on the blob upload, mirroring server-side guardrails. */
  maxByteSize: number;
}

export interface UpdateMediaAttachmentRequest {
  caption?: string | null;
}

export interface VoidMediaAttachmentRequest {
  reason?: string;
}

export interface AcknowledgeFinishedVisitReviewRequest {
  decision: Extract<FinishedVisitReviewDecision, 'keptOpen'>;
  occurredAt?: string;
}

export interface JobMutationResponse extends JobSummary {
  warningMessages?: string[];
  syncResult?: SyncResult;
}

export interface FieldAssignedWorkResponse {
  jobs: JobSummary[];
  locations: LocationSummary[];
  customers: CustomerAccountSummary[];
  equipment: EquipmentSummary[];
  serverTime: string;
  snapshotVersion: string;
  windowStartDate: string;
  windowEndDate: string;
}
