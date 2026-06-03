import type {
  AcknowledgeFinishedVisitReviewRequest,
  AppointmentFinishOutcome,
  AppointmentStatus,
  AppointmentSummary,
  ContactDetail,
  ContactLink,
  ContactMutationResponse,
  ContactSummary,
  ContactUpdateScope,
  CreateContactRequest,
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResponse,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerAccountSummary,
  CustomerDetail,
  CustomerMutationResponse,
  DispatchAppointmentSummary,
  DispatchBoardResponse,
  DispatchEquipmentGlance,
  DuplicateCandidate,
  EquipmentDeleteResponse,
  EquipmentDetail,
  EquipmentHistoryEntry,
  EquipmentGroupSummary,
  EquipmentLinkedSummary,
  EquipmentStatus,
  EquipmentMutationResponse,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  CreateEstimateRequest,
  DeclineEstimateRequest,
  EstimateLineItemInput,
  EstimateLineItemKind,
  EstimateResponse,
  EstimatesResponse,
  EstimateStatus,
  EstimateSummary,
  UpdateEstimateRequest,
  InvoiceAdjustmentKind,
  InvoiceLineItemInput,
  InvoiceLineItemKind,
  InvoiceLineItemSummary,
  BookkeepingQueuesResponse,
  BookkeepingInvoiceItem,
  BookkeepingBalanceItem,
  InvoiceResponse,
  InvoiceSummary,
  JobAdjustmentsResponse,
  JobInvoiceBalance,
  JobPaymentsResponse,
  Payment,
  PaymentMethod,
  PaymentResponse,
  RecordPaymentRequest,
  JobDetailResponse,
  JobIntakeContextResponse,
  JobStatus,
  JobsQueueKey,
  JobsQueueResponse,
  JobsWorkspaceResponse,
  JobSummary,
  JobMutationResponse,
  LinkEquipmentReplacementRequest,
  LinkContactRequest,
  LocationDetail,
  LocationMutationResponse,
  LocationSummary,
  MediaAttachmentResponse,
  MediaAttachmentsResponse,
  MediaAttachmentSummary,
  ReassignLocationOwnerRequest,
  RegisterEntriesResponse,
  RegisterEntryKind,
  RegisterEntrySummary,
  UpdateAppointmentScheduleRequest,
  UpdateContactLinkRequest,
  UpdateContactRequest,
  UpdateCustomerRequest,
  UpdateJobStatusResponse,
  UpdateLocationRequest,
  UpdateMediaAttachmentRequest,
  UpdateRegisterEntryRequest,
  VoidMediaAttachmentRequest,
  VoidRegisterEntryRequest,
  InventoryItem,
  InventoryItemKind,
  InventoryItemResponse,
  InventoryItemsResponse,
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  InventoryLocation,
  InventoryLocationKind,
  InventoryLocationResponse,
  InventoryLocationsResponse,
  CreateInventoryLocationRequest,
  UpdateInventoryLocationRequest,
  InventoryMovement,
  InventoryMovementKind,
  InventoryMovementResponse,
  InventoryOnHandRow,
  InventoryOnHandResponse,
  CreateInventoryAdjustmentRequest,
  CreateInventoryTransferRequest,
  CreateInventoryIssueRequest,
  PurchaseOrder,
  PurchaseOrderSummary,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderDestinationKind,
  PurchaseOrderLineKind,
  PurchaseOrderResponse,
  PurchaseOrdersResponse,
  CreatePurchaseOrderRequest,
  CreatePurchaseOrderLineRequest,
  ReceivePurchaseOrderRequest,
  ReceivePurchaseOrderLineInput,
  JobCostEvent,
  JobCostEventKind,
  JobCostRollup,
  JobCostSnapshot,
  JobCostingSummary,
  JobCostingResponse,
  JobCostEventResponse,
  CreateJobLaborRequest,
  CreateJobExpenseRequest,
  ReverseJobCostEventRequest
} from '@bellfield/contracts';
import { resolveOfficeApiBaseUrl } from './api-base-url';

export type {
  AcknowledgeFinishedVisitReviewRequest,
  AppointmentFinishOutcome,
  AppointmentStatus,
  AppointmentSummary,
  ContactDetail,
  ContactLink,
  ContactMutationResponse,
  ContactSummary,
  ContactUpdateScope,
  CreateContactRequest,
  CreateCustomerRequest,
  CreateLocationRequest,
  CrmSearchResponse,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerAccountSummary,
  CustomerDetail,
  CustomerMutationResponse,
  DispatchAppointmentSummary,
  DispatchBoardResponse,
  DispatchEquipmentGlance,
  DuplicateCandidate,
  EquipmentDeleteResponse,
  EquipmentDetail,
  EquipmentHistoryEntry,
  EquipmentGroupSummary,
  EquipmentLinkedSummary,
  EquipmentStatus,
  EquipmentMutationResponse,
  EquipmentSummary,
  EquipmentWorkspaceResponse,
  CreateEstimateRequest,
  DeclineEstimateRequest,
  EstimateLineItemInput,
  EstimateLineItemKind,
  EstimateResponse,
  EstimatesResponse,
  EstimateStatus,
  EstimateSummary,
  UpdateEstimateRequest,
  InvoiceAdjustmentKind,
  InvoiceLineItemInput,
  InvoiceLineItemKind,
  InvoiceLineItemSummary,
  BookkeepingQueuesResponse,
  BookkeepingInvoiceItem,
  BookkeepingBalanceItem,
  InvoiceResponse,
  InvoiceSummary,
  JobAdjustmentsResponse,
  JobInvoiceBalance,
  JobPaymentsResponse,
  Payment,
  PaymentMethod,
  PaymentResponse,
  RecordPaymentRequest,
  JobDetailResponse,
  JobIntakeContextResponse,
  JobStatus,
  JobsQueueKey,
  JobsQueueResponse,
  JobsWorkspaceResponse,
  JobSummary,
  JobMutationResponse,
  LinkContactRequest,
  LocationDetail,
  LocationMutationResponse,
  LocationSummary,
  MediaAttachmentSummary,
  RegisterEntryKind,
  RegisterEntrySummary,
  InventoryItem,
  InventoryItemKind,
  InventoryItemResponse,
  InventoryItemsResponse,
  CreateInventoryItemRequest,
  UpdateInventoryItemRequest,
  InventoryLocation,
  InventoryLocationKind,
  InventoryLocationResponse,
  InventoryLocationsResponse,
  CreateInventoryLocationRequest,
  UpdateInventoryLocationRequest,
  InventoryMovement,
  InventoryMovementKind,
  InventoryMovementResponse,
  InventoryOnHandRow,
  InventoryOnHandResponse,
  CreateInventoryAdjustmentRequest,
  CreateInventoryTransferRequest,
  CreateInventoryIssueRequest,
  PurchaseOrder,
  PurchaseOrderSummary,
  PurchaseOrderLine,
  PurchaseOrderStatus,
  PurchaseOrderDestinationKind,
  PurchaseOrderLineKind,
  PurchaseOrderResponse,
  PurchaseOrdersResponse,
  CreatePurchaseOrderRequest,
  CreatePurchaseOrderLineRequest,
  ReceivePurchaseOrderRequest,
  ReceivePurchaseOrderLineInput,
  JobCostEvent,
  JobCostEventKind,
  JobCostRollup,
  JobCostSnapshot,
  JobCostingSummary,
  JobCostingResponse,
  JobCostEventResponse,
  CreateJobLaborRequest,
  CreateJobExpenseRequest,
  ReverseJobCostEventRequest
};

export type JobUpdateResponse = UpdateJobStatusResponse;

async function requestJson<TResponse>(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken?: string } = {}
): Promise<TResponse> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return (await response.json()) as TResponse;
}

async function requestBlob(
  path: string,
  options: RequestInit & { apiBaseUrl?: string; sessionToken?: string } = {}
): Promise<Blob> {
  const { apiBaseUrl, headers, sessionToken, ...requestOptions } = options;
  const resolvedApiBaseUrl = resolveOfficeApiBaseUrl(apiBaseUrl);
  const response = await fetch(`${resolvedApiBaseUrl}${path}`, {
    ...requestOptions,
    headers: {
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...headers
    }
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(errorBody?.message ?? 'Request failed.');
  }

  return response.blob();
}

export async function getOfficeEquipmentWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  includeInactive?: boolean;
}): Promise<EquipmentWorkspaceResponse> {
  const includeInactive = input.includeInactive ? '?includeInactive=true' : '';

  return requestJson<EquipmentWorkspaceResponse>(`/operations/equipment${includeInactive}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeEquipmentDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  equipmentId: string;
}): Promise<EquipmentDetail> {
  return requestJson<EquipmentDetail>(`/operations/equipment/${input.equipmentId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeEquipment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
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
}): Promise<EquipmentMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EquipmentMutationResponse>('/operations/equipment', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeEquipment(input: {
  equipmentId: string;
  sessionToken: string;
  apiBaseUrl?: string;
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  filterSizes?: string[];
  equipmentLocationDescription?: string;
  installDate?: string;
  warrantyStartDate?: string;
  warrantyEndDate?: string;
  warrantyProviderNote?: string;
  systemGroupName?: string;
  clearSystemGroup?: boolean;
  status?: EquipmentStatus;
  notes?: string;
  confirmMissingSerial?: boolean;
}): Promise<EquipmentMutationResponse> {
  return requestJson<EquipmentMutationResponse>(`/operations/equipment/${input.equipmentId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({
      locationId: input.locationId,
      inventoryLocationLabel: input.inventoryLocationLabel,
      equipmentType: input.equipmentType,
      brand: input.brand,
      model: input.model,
      serialNumber: input.serialNumber,
      filterSizes: input.filterSizes,
      equipmentLocationDescription: input.equipmentLocationDescription,
      installDate: input.installDate,
      warrantyStartDate: input.warrantyStartDate,
      warrantyEndDate: input.warrantyEndDate,
      warrantyProviderNote: input.warrantyProviderNote,
      systemGroupName: input.systemGroupName,
      clearSystemGroup: input.clearSystemGroup,
      status: input.status,
      notes: input.notes,
      confirmMissingSerial: input.confirmMissingSerial
    })
  });
}

export async function linkOfficeEquipmentReplacement(
  input: LinkEquipmentReplacementRequest & {
    equipmentId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<EquipmentMutationResponse> {
  const { equipmentId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EquipmentMutationResponse>(
    `/operations/equipment/${equipmentId}/replacement-link`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function deleteOfficeEquipment(input: {
  equipmentId: string;
  sessionToken: string;
  apiBaseUrl?: string;
  confirmDelete: boolean;
}): Promise<EquipmentDeleteResponse> {
  return requestJson<EquipmentDeleteResponse>(
    `/operations/equipment/${input.equipmentId}?confirm=${input.confirmDelete ? 'true' : 'false'}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'DELETE'
    }
  );
}

export async function getOfficeJobsWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobsWorkspaceResponse> {
  return requestJson<JobsWorkspaceResponse>('/operations/jobs', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeJobIntakeContext(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobIntakeContextResponse> {
  return requestJson<JobIntakeContextResponse>('/operations/jobs/intake-context', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeDispatchBoard(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  startDate: string;
  endDate?: string;
}): Promise<DispatchBoardResponse> {
  const searchParams = new URLSearchParams({ startDate: input.startDate });

  if (input.endDate) {
    searchParams.set('endDate', input.endDate);
  }

  return requestJson<DispatchBoardResponse>(`/operations/dispatch?${searchParams.toString()}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeJobDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  timelineLimit?: number;
}): Promise<JobDetailResponse> {
  const searchParams = new URLSearchParams();

  if (input.timelineLimit !== undefined) {
    searchParams.set('timelineLimit', String(input.timelineLimit));
  }

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestJson<JobDetailResponse>(`/operations/jobs/${input.jobId}/detail${query}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeJobsQueue(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  limit?: number;
  cursors?: Partial<Record<JobsQueueKey, string>>;
}): Promise<JobsQueueResponse> {
  const searchParams = new URLSearchParams();

  if (input.limit !== undefined) {
    searchParams.set('limit', String(input.limit));
  }

  Object.entries(input.cursors ?? {}).forEach(([queueKey, cursor]) => {
    if (cursor) {
      searchParams.set(`${queueKey}Cursor`, cursor);
    }
  });

  const query = searchParams.size > 0 ? `?${searchParams.toString()}` : '';

  return requestJson<JobsQueueResponse>(`/operations/jobs/queue${query}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeJob(input: {
  sessionToken: string;
  apiBaseUrl?: string;
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
}): Promise<JobSummary> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<JobSummary>('/operations/jobs', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeJobStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  status: JobStatus;
}): Promise<JobUpdateResponse> {
  return requestJson<JobUpdateResponse>(`/operations/jobs/${input.jobId}/status`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({ status: input.status })
  });
}

export async function addOfficeAppointment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  timeWindowLabel?: string;
  technicianId?: string;
}): Promise<JobSummary> {
  return requestJson<JobSummary>(`/operations/jobs/${input.jobId}/appointments`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify({
      scheduledDate: input.scheduledDate,
      scheduledStartTime: input.scheduledStartTime,
      scheduledEndTime: input.scheduledEndTime,
      timeWindowLabel: input.timeWindowLabel,
      technicianId: input.technicianId
    })
  });
}

export async function acknowledgeOfficeFinishedVisitReview(
  input: AcknowledgeFinishedVisitReviewRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    jobId: string;
  }
): Promise<JobMutationResponse> {
  const { sessionToken, apiBaseUrl, jobId, ...payload } = input;

  return requestJson<JobMutationResponse>(`/operations/jobs/${jobId}/finished-visit-review`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeAppointmentSchedule(
  input: UpdateAppointmentScheduleRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    appointmentId: string;
  }
): Promise<JobSummary> {
  return requestJson<JobSummary>(`/operations/jobs/appointments/${input.appointmentId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({
      scheduledDate: input.scheduledDate,
      scheduledStartTime: input.scheduledStartTime,
      scheduledEndTime: input.scheduledEndTime,
      timeWindowLabel: input.timeWindowLabel,
      technicianId: input.technicianId,
      occurredAt: input.occurredAt
    })
  });
}

export async function updateOfficeAppointmentStatus(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  appointmentId: string;
  status: AppointmentStatus;
  finishOutcome?: AppointmentFinishOutcome;
  visitNotes?: string;
  hasChargeActivity?: boolean;
  registerFollowUpNote?: string;
}): Promise<JobSummary> {
  return requestJson<JobSummary>(`/operations/jobs/appointments/${input.appointmentId}/status`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PATCH',
    body: JSON.stringify({
      status: input.status,
      finishOutcome: input.finishOutcome,
      visitNotes: input.visitNotes,
      hasChargeActivity: input.hasChargeActivity,
      registerFollowUpNote: input.registerFollowUpNote
    })
  });
}

export async function getOfficeRegisterEntries(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
}): Promise<RegisterEntriesResponse> {
  return requestJson<RegisterEntriesResponse>(`/operations/jobs/${input.jobId}/register-entries`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function updateOfficeRegisterEntry(
  input: UpdateRegisterEntryRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    registerEntryId: string;
  }
): Promise<JobMutationResponse> {
  const { sessionToken, apiBaseUrl, registerEntryId, ...payload } = input;

  return requestJson<JobMutationResponse>(`/operations/jobs/register-entries/${registerEntryId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function voidOfficeRegisterEntry(
  input: VoidRegisterEntryRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    registerEntryId: string;
  }
): Promise<JobMutationResponse> {
  const { sessionToken, apiBaseUrl, registerEntryId, ...payload } = input;

  return requestJson<JobMutationResponse>(
    `/operations/jobs/register-entries/${registerEntryId}/void`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function getOfficeMediaAttachments(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
}): Promise<MediaAttachmentsResponse> {
  return requestJson<MediaAttachmentsResponse>(`/operations/jobs/${input.jobId}/media`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function updateOfficeMediaAttachment(
  input: UpdateMediaAttachmentRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    mediaId: string;
  }
): Promise<MediaAttachmentResponse> {
  const { sessionToken, apiBaseUrl, mediaId, ...payload } = input;

  return requestJson<MediaAttachmentResponse>(`/operations/media/${mediaId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function voidOfficeMediaAttachment(
  input: VoidMediaAttachmentRequest & {
    sessionToken: string;
    apiBaseUrl?: string;
    mediaId: string;
  }
): Promise<MediaAttachmentResponse> {
  const { sessionToken, apiBaseUrl, mediaId, ...payload } = input;

  return requestJson<MediaAttachmentResponse>(`/operations/media/${mediaId}/void`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeMediaBlob(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  mediaId: string;
}): Promise<Blob> {
  return requestBlob(`/operations/media/${input.mediaId}/blob`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function getOfficeCrmWorkspace(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<CrmWorkspaceResponse> {
  return requestJson<CrmWorkspaceResponse>('/operations/crm', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function searchOfficeCrm(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  query: string;
}): Promise<CrmSearchResponse> {
  return requestJson<CrmSearchResponse>(
    `/operations/crm/search?q=${encodeURIComponent(input.query)}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

export async function getOfficeCustomerDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  customerId: string;
}): Promise<CustomerDetail> {
  return requestJson<CustomerDetail>(`/operations/crm/customers/${input.customerId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeCustomer(
  input: CreateCustomerRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<CustomerMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<CustomerMutationResponse>('/operations/crm/customers', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeCustomer(
  input: UpdateCustomerRequest & { customerId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<CustomerMutationResponse> {
  const { customerId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<CustomerMutationResponse>(`/operations/crm/customers/${customerId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeLocationDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  locationId: string;
}): Promise<LocationDetail> {
  return requestJson<LocationDetail>(`/operations/crm/locations/${input.locationId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeLocation(
  input: CreateLocationRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<LocationMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>('/operations/crm/locations', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeLocation(
  input: UpdateLocationRequest & { locationId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<LocationMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>(`/operations/crm/locations/${locationId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function reassignOfficeLocationOwner(
  input: ReassignLocationOwnerRequest & {
    locationId: string;
    sessionToken: string;
    apiBaseUrl?: string;
  }
): Promise<LocationMutationResponse> {
  const { locationId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<LocationMutationResponse>(
    `/operations/crm/locations/${locationId}/reassign-owner`,
    {
      apiBaseUrl,
      sessionToken,
      method: 'POST',
      body: JSON.stringify(payload)
    }
  );
}

export async function getOfficeContactDetail(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  contactId: string;
}): Promise<ContactDetail> {
  return requestJson<ContactDetail>(`/operations/crm/contacts/${input.contactId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeContact(
  input: CreateContactRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>('/operations/crm/contacts', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeContact(
  input: UpdateContactRequest & { contactId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { contactId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>(`/operations/crm/contacts/${contactId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function linkOfficeContact(
  input: LinkContactRequest & { sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>('/operations/crm/contact-links', {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeContactLink(
  input: UpdateContactLinkRequest & { linkId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<ContactMutationResponse> {
  const { linkId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<ContactMutationResponse>(`/operations/crm/contact-links/${linkId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
}

export async function getOfficeEstimatesForJob(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EstimatesResponse> {
  return requestJson<EstimatesResponse>(`/operations/jobs/${input.jobId}/estimates`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function createOfficeEstimate(
  input: CreateEstimateRequest & { jobId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<EstimateResponse> {
  const { jobId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EstimateResponse>(`/operations/jobs/${jobId}/estimates`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function updateOfficeEstimate(
  input: UpdateEstimateRequest & { estimateId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<EstimateResponse> {
  const { estimateId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EstimateResponse>(`/operations/estimates/${estimateId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function approveOfficeEstimate(input: {
  estimateId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<EstimateResponse> {
  return requestJson<EstimateResponse>(`/operations/estimates/${input.estimateId}/approve`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST'
  });
}

export async function declineOfficeEstimate(
  input: DeclineEstimateRequest & { estimateId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<EstimateResponse> {
  const { estimateId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<EstimateResponse>(`/operations/estimates/${estimateId}/decline`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function convertOfficeEstimateToInvoice(input: {
  estimateId: string;
  mode?: 'append' | 'replace';
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  const { estimateId, sessionToken, apiBaseUrl, mode } = input;

  return requestJson<InvoiceResponse>(`/operations/estimates/${estimateId}/convert-to-invoice`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify({ mode })
  });
}

export async function getOfficeInvoiceForJob(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  return requestJson<InvoiceResponse>(`/operations/jobs/${input.jobId}/invoice`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

export async function addOfficeInvoiceLine(
  input: InvoiceLineItemInput & { jobId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<InvoiceResponse> {
  const { jobId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<InvoiceResponse>(`/operations/jobs/${jobId}/invoice/lines`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function editOfficeInvoiceLine(
  input: InvoiceLineItemInput & { lineId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<InvoiceResponse> {
  const { lineId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<InvoiceResponse>(`/operations/invoices/lines/${lineId}`, {
    apiBaseUrl,
    sessionToken,
    method: 'PUT',
    body: JSON.stringify(payload)
  });
}

export async function voidOfficeInvoiceLine(input: {
  lineId: string;
  reason?: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  const { lineId, sessionToken, apiBaseUrl, reason } = input;

  return requestJson<InvoiceResponse>(`/operations/invoices/lines/${lineId}/void`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

/** Post (lock) a job's main invoice draft. No body: the job is in the path and the actor
 * comes from the session. Returns the now-posted invoice with its frozen context. */
export async function postOfficeInvoice(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  return requestJson<InvoiceResponse>(`/operations/jobs/${input.jobId}/invoice/post`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST'
  });
}

/** Net amount billed on a job across its posted invoices (main + adjustments − credits). */
export async function getOfficeJobInvoiceBalance(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobInvoiceBalance> {
  return requestJson<JobInvoiceBalance>(`/operations/jobs/${input.jobId}/invoice/balance`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** List a job's adjustment/credit correction records (each a full invoice). */
export async function listOfficeJobAdjustments(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobAdjustmentsResponse> {
  return requestJson<JobAdjustmentsResponse>(
    `/operations/jobs/${input.jobId}/invoice/adjustments`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

/** Create a draft adjustment or credit against a job's posted main invoice. */
export async function createOfficeJobAdjustment(input: {
  jobId: string;
  kind: InvoiceAdjustmentKind;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  return requestJson<InvoiceResponse>(`/operations/jobs/${input.jobId}/invoice/adjustments`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify({ kind: input.kind })
  });
}

/** Add a manual line to any invoice by id (used for adjustment/credit lines). */
export async function addOfficeInvoiceLineById(
  input: InvoiceLineItemInput & { invoiceId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<InvoiceResponse> {
  const { invoiceId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<InvoiceResponse>(`/operations/invoices/${invoiceId}/lines`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/** Post (lock) any invoice by id (used for adjustment/credit records). */
export async function postOfficeInvoiceById(input: {
  invoiceId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InvoiceResponse> {
  return requestJson<InvoiceResponse>(`/operations/invoices/${input.invoiceId}/post`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST'
  });
}

/** List a job's payments across its posted invoices (newest first). */
export async function listOfficeJobPayments(input: {
  jobId: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<JobPaymentsResponse> {
  return requestJson<JobPaymentsResponse>(`/operations/jobs/${input.jobId}/invoice/payments`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Record a payment against a posted invoice. */
export async function recordOfficePayment(
  input: RecordPaymentRequest & { invoiceId: string; sessionToken: string; apiBaseUrl?: string }
): Promise<PaymentResponse> {
  const { invoiceId, sessionToken, apiBaseUrl, ...payload } = input;

  return requestJson<PaymentResponse>(`/operations/invoices/${invoiceId}/payments`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

/** Void a payment by id (the correction path; payments are never edited in place). */
export async function voidOfficePayment(input: {
  paymentId: string;
  reason?: string;
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<PaymentResponse> {
  const { paymentId, sessionToken, apiBaseUrl, reason } = input;

  return requestJson<PaymentResponse>(`/operations/payments/${paymentId}/void`, {
    apiBaseUrl,
    sessionToken,
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

/** Cross-job bookkeeping worklists: ready-to-post, open balances, recently posted. */
export async function getOfficeBookkeepingQueues(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<BookkeepingQueuesResponse> {
  return requestJson<BookkeepingQueuesResponse>('/operations/bookkeeping/invoice-queues', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

// --- Inventory (Milestone 9) ----------------------------------------------------

/** Inventory catalog items (active first, then by name). */
export async function getOfficeInventoryItems(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryItemsResponse> {
  return requestJson<InventoryItemsResponse>('/operations/inventory/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Stock locations (warehouses, trucks). */
export async function getOfficeInventoryLocations(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryLocationsResponse> {
  return requestJson<InventoryLocationsResponse>('/operations/inventory/locations', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Derived on-hand per (item, location): quantity, weighted-average cost, total value. */
export async function getOfficeInventoryOnHand(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/on-hand', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** The immutable movement ledger, optionally filtered to one item or job (newest first). */
export async function getOfficeInventoryMovements(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  itemId?: string;
  jobId?: string;
}): Promise<InventoryMovementResponse> {
  const query = new URLSearchParams();
  if (input.itemId) {
    query.set('itemId', input.itemId);
  }
  if (input.jobId) {
    query.set('jobId', input.jobId);
  }
  const suffix = query.toString();
  return requestJson<InventoryMovementResponse>(
    `/operations/inventory/movements${suffix ? `?${suffix}` : ''}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

/** Create a catalog item. */
export async function createOfficeInventoryItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryItemRequest;
}): Promise<InventoryItemResponse> {
  return requestJson<InventoryItemResponse>('/operations/inventory/items', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Update a catalog item (including active state). */
export async function updateOfficeInventoryItem(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  itemId: string;
  body: UpdateInventoryItemRequest;
}): Promise<InventoryItemResponse> {
  return requestJson<InventoryItemResponse>(`/operations/inventory/items/${input.itemId}`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'PUT',
    body: JSON.stringify(input.body)
  });
}

/** Create a stock location. */
export async function createOfficeInventoryLocation(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryLocationRequest;
}): Promise<InventoryLocationResponse> {
  return requestJson<InventoryLocationResponse>('/operations/inventory/locations', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Update a stock location (including active state). */
export async function updateOfficeInventoryLocation(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  locationId: string;
  body: UpdateInventoryLocationRequest;
}): Promise<InventoryLocationResponse> {
  return requestJson<InventoryLocationResponse>(
    `/operations/inventory/locations/${input.locationId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'PUT',
      body: JSON.stringify(input.body)
    }
  );
}

/** Adjust on-hand at a location (gain/loss). Returns refreshed on-hand. */
export async function createOfficeInventoryAdjustment(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryAdjustmentRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/adjustments', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Transfer stock between two locations. Returns refreshed on-hand. */
export async function createOfficeInventoryTransfer(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryTransferRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/transfers', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Issue stock from a location to a job. Returns refreshed on-hand. */
export async function issueOfficeInventoryToJob(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreateInventoryIssueRequest;
}): Promise<InventoryOnHandResponse> {
  return requestJson<InventoryOnHandResponse>('/operations/inventory/issues', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

// --- Purchasing (Milestone 9) ---------------------------------------------------

/** Purchase-order summaries (newest first). */
export async function listOfficePurchaseOrders(input: {
  sessionToken: string;
  apiBaseUrl?: string;
}): Promise<PurchaseOrdersResponse> {
  return requestJson<PurchaseOrdersResponse>('/operations/purchase-orders', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** A single purchase order with its lines. */
export async function getOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken
    }
  );
}

/** Create a draft purchase order (one destination, ≥1 line). */
export async function createOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  body: CreatePurchaseOrderRequest;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>('/operations/purchase-orders', {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Transition a draft purchase order to ordered. */
export async function orderOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}/order`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST'
    }
  );
}

/** Receive an ordered purchase order in full. */
export async function receiveOfficePurchaseOrder(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  purchaseOrderId: string;
  body: ReceivePurchaseOrderRequest;
}): Promise<PurchaseOrderResponse> {
  return requestJson<PurchaseOrderResponse>(
    `/operations/purchase-orders/${input.purchaseOrderId}/receive`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST',
      body: JSON.stringify(input.body)
    }
  );
}

// --- Job costing (Milestone 9) --------------------------------------------------

/** A job's cost read model: live rollup, finalized snapshot, and labor/expense events. */
export async function getOfficeJobCosting(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
}): Promise<JobCostingResponse> {
  return requestJson<JobCostingResponse>(`/operations/jobs/${input.jobId}/costing`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken
  });
}

/** Post a labor cost event to a job (amount = hours × ratePerHour). */
export async function postOfficeJobLabor(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  body: CreateJobLaborRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(`/operations/jobs/${input.jobId}/labor`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Post an expense cost event to a job. */
export async function postOfficeJobExpense(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  body: CreateJobExpenseRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(`/operations/jobs/${input.jobId}/expenses`, {
    apiBaseUrl: input.apiBaseUrl,
    sessionToken: input.sessionToken,
    method: 'POST',
    body: JSON.stringify(input.body)
  });
}

/** Reverse (correct) a labor/expense cost event by posting its negation. */
export async function reverseOfficeJobCostEvent(input: {
  sessionToken: string;
  apiBaseUrl?: string;
  jobId: string;
  eventId: string;
  body: ReverseJobCostEventRequest;
}): Promise<JobCostEventResponse> {
  return requestJson<JobCostEventResponse>(
    `/operations/jobs/${input.jobId}/cost-events/${input.eventId}/reverse`,
    {
      apiBaseUrl: input.apiBaseUrl,
      sessionToken: input.sessionToken,
      method: 'POST',
      body: JSON.stringify(input.body)
    }
  );
}
