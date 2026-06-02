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
  /** Set once this estimate has been converted into an invoice draft. */
  convertedToInvoiceId?: string;
  createdByEmployeeId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

// --- Invoices (Milestone 7 draft + Milestone 8 posting/lock) --------------------

export type InvoiceStatus = 'draft' | 'posted';
export type InvoiceKind = 'main' | 'adjustment' | 'credit';
/** The correction-record kinds an office user can create against a posted main invoice.
 * 'adjustment' adds a charge; 'credit' reduces what's owed. Both carry positive amounts. */
export type InvoiceAdjustmentKind = 'adjustment' | 'credit';
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

/**
 * Customer/location/job display context frozen onto an invoice at the moment it is
 * posted, so later edits to current CRM records never rewrite what a posted invoice
 * meant. Money totals are NOT here — those already freeze on write. Present only when
 * `status === 'posted'`. Address/account-type fields are optional because a customer
 * or location may legitimately have been recorded without complete address data.
 */
export interface PostedInvoiceContext {
  postedAt: string;
  postedByName: string;
  billTo: {
    customerId: string;
    name: string;
    accountType?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  serviceLocation: {
    locationId: string;
    name: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  };
  jobNumber: string;
  workOrderNumber?: string;
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
  /** Frozen display context, set once the invoice is posted (see PostedInvoiceContext). */
  posted?: PostedInvoiceContext;
  /** For an adjustment/credit, the main invoice it corrects. Null for the main invoice. */
  adjustsInvoiceId?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface InvoiceResponse {
  invoice: InvoiceSummary;
}

/** A job's adjustment/credit correction records (each a full invoice), newest first. */
export interface JobAdjustmentsResponse {
  adjustments: InvoiceSummary[];
}

/** Create an adjustment or credit against a job's posted main invoice. */
export interface CreateAdjustmentRequest {
  kind: InvoiceAdjustmentKind;
}

/**
 * Net amount billed on a job across its POSTED invoices: the posted main total plus
 * posted adjustments minus posted credits. "Billed" means posted/accounting-visible, so a
 * draft main contributes 0 (`mainInvoiceStatus` says whether it is posted yet). `netBilled`
 * may be negative (a net credit balance). `paidTotal` is the sum of the job's non-void
 * payments; `amountDue` = netBilled − paidTotal (may be negative = overpaid/credit balance).
 */
export interface JobInvoiceBalance {
  jobId: string;
  mainInvoiceStatus: InvoiceStatus;
  postedMainTotal: number;
  postedAdjustmentsTotal: number;
  postedCreditsTotal: number;
  netBilled: number;
  paidTotal: number;
  amountDue: number;
}

// --- Payments (Milestone 8, online-only v1) -------------------------------------

/** How a manually recorded payment was tendered. */
export type PaymentMethod = 'cash' | 'check' | 'card' | 'ach' | 'other';

/**
 * A payment received against a posted invoice. An append-only ledger entry: it never
 * changes invoice totals; the job's amount due is derived as net billed − non-void
 * payments. A correction is a void (`isVoid`), not an edit of the amount.
 */
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  receivedAt: string;
  reference?: string;
  memo?: string;
  recordedByName: string;
  isVoid: boolean;
  voidReason?: string;
  voidedByName?: string;
  voidedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Record a payment against a posted invoice. Amount is positive dollars. */
export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  /** ISO date/time the payment was received. Defaults to now when omitted. */
  receivedAt?: string;
  reference?: string;
  memo?: string;
}

/** Void an existing payment (the correction path; payments are never edited in place). */
export interface VoidPaymentRequest {
  reason?: string;
}

export interface PaymentResponse {
  payment: Payment;
}

/** A job's payments across its posted invoices, newest first. */
export interface JobPaymentsResponse {
  payments: Payment[];
}

// --- Bookkeeping workbench (Milestone 8) ----------------------------------------

/** One invoice in a bookkeeping worklist (ready-to-post or recently-posted). */
export interface BookkeepingInvoiceItem {
  invoiceId: string;
  jobId: string;
  jobNumber: string;
  invoiceKind: InvoiceKind;
  customerName: string;
  total: number;
  postedAt?: string;
  updatedAt: string;
}

/** One job with an outstanding balance in the open-balance worklist. */
export interface BookkeepingBalanceItem {
  jobId: string;
  jobNumber: string;
  customerName: string;
  netBilled: number;
  paidTotal: number;
  amountDue: number;
}

/**
 * Cross-job bookkeeping worklists (each bounded): main drafts ready to post, jobs with
 * an outstanding balance, and recently posted invoices. A read-only review surface.
 */
export interface BookkeepingQueuesResponse {
  readyToPost: BookkeepingInvoiceItem[];
  openBalance: BookkeepingBalanceItem[];
  recentlyPosted: BookkeepingInvoiceItem[];
}

/** A manual invoice line the office adds, or the shape it edits a line into. */
export interface InvoiceLineItemInput {
  kind: InvoiceLineItemKind;
  description: string;
  quantity: number;
  unitOfMeasure?: string;
  unitPrice: number;
  unitCost?: number;
  taxable: boolean;
}

export interface VoidInvoiceLineItemRequest {
  reason?: string;
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

/**
 * Convert an approved estimate into the job's invoice draft. `mode` decides what
 * happens to lines already on the draft: 'append' adds the estimate's lines
 * after them; 'replace' voids the existing draft lines first. Omitting `mode`
 * when the draft already has active lines is rejected (block-with-choice), so a
 * conversion can never silently duplicate billing.
 */
export interface ConvertEstimateToInvoiceRequest {
  mode?: 'append' | 'replace';
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

// --- Inventory (Milestone 9) ----------------------------------------------------

/** A catalog item: a stocked part, or an equipment-type (serialized/trackable) item. */
export type InventoryItemKind = 'part' | 'equipment';

/**
 * Catalog identity only — NOT a stock balance. On-hand quantity and actual cost are
 * derived from the inventory movement ledger; defaultUnitCost is just a planning
 * convenience used to prefill PO lines.
 */
export interface InventoryItem {
  id: string;
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryItemRequest {
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
}

export interface UpdateInventoryItemRequest {
  sku?: string;
  name: string;
  kind: InventoryItemKind;
  unitOfMeasure?: string;
  defaultUnitCost?: number;
  description?: string;
  isActive: boolean;
}

export interface InventoryItemsResponse {
  items: InventoryItem[];
}

export interface InventoryItemResponse {
  item: InventoryItem;
}

/** A non-customer stock location: a warehouse, a technician truck/van, or other. */
export type InventoryLocationKind = 'warehouse' | 'truck' | 'other';

export interface InventoryLocation {
  id: string;
  name: string;
  kind: InventoryLocationKind;
  /** For a truck/van, the technician it belongs to (optional). */
  assignedEmployeeId?: string;
  assignedEmployeeName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryLocationRequest {
  name: string;
  kind: InventoryLocationKind;
  assignedEmployeeId?: string;
}

export interface UpdateInventoryLocationRequest {
  name: string;
  kind: InventoryLocationKind;
  assignedEmployeeId?: string;
  isActive: boolean;
}

export interface InventoryLocationsResponse {
  locations: InventoryLocation[];
}

export interface InventoryLocationResponse {
  location: InventoryLocation;
}

// --- Inventory movements / on-hand (Milestone 9) --------------------------------

export type InventoryMovementKind =
  | 'receiveToInventory'
  | 'receiveToJob'
  | 'issueToJob'
  | 'transfer'
  | 'adjustmentGain'
  | 'adjustmentLoss'
  | 'returnFromJob';

/** A single immutable ledger entry. quantity is signed relative to its location. */
export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  kind: InventoryMovementKind;
  quantity: number;
  unitCost: number;
  locationId?: string;
  locationName?: string;
  jobId?: string;
  note?: string;
  actorName: string;
  occurredAt: string;
}

/** Derived on-hand balance for one item at one location (qty + weighted-average value). */
export interface InventoryOnHandRow {
  itemId: string;
  itemName: string;
  itemKind: InventoryItemKind;
  locationId: string;
  locationName: string;
  quantity: number;
  /** Weighted-average unit cost at this location (0 when quantity is 0). */
  averageUnitCost: number;
  totalValue: number;
}

export interface InventoryOnHandResponse {
  rows: InventoryOnHandRow[];
}

/**
 * Adjust on-hand at a location. quantityDelta is signed: positive = gain (found),
 * negative = loss (shrinkage/damage). A gain should carry a unitCost; a loss is valued
 * at the current average.
 */
export interface CreateInventoryAdjustmentRequest {
  itemId: string;
  locationId: string;
  quantityDelta: number;
  unitCost?: number;
  note?: string;
}

/** Move stock between two locations. Cost travels with the goods at the source average. */
export interface CreateInventoryTransferRequest {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  note?: string;
}

export interface InventoryMovementResponse {
  movements: InventoryMovement[];
}
