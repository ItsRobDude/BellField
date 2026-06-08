import type { CatalogLineSnapshot } from './catalog.js';
import type { CustomerAccountSummary, LocationSummary } from './crm.js';
import type { EquipmentSummary } from './equipment.js';

export type ServiceAgreementStatus = 'draft' | 'active' | 'paused' | 'ended';

export type ServiceAgreementBillingCadence =
  | 'none'
  | 'monthly'
  | 'quarterly'
  | 'semiAnnual'
  | 'annual'
  | 'custom';

export type ServiceAgreementVisitFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semiAnnual'
  | 'annual'
  | 'custom';

export interface ServiceAgreementCoveredLocation {
  id: string;
  agreementId: string;
  locationId: string;
  locationName: string;
  createdAt: string;
}

export interface ServiceAgreementCoveredEquipment {
  id: string;
  agreementId: string;
  equipmentId: string;
  equipmentLabel: string;
  locationId: string;
  locationName: string;
  createdAt: string;
}

export interface ServiceAgreementVisitTemplate {
  id: string;
  agreementId: string;
  title: string;
  frequency: ServiceAgreementVisitFrequency;
  intervalMonths?: number;
  preferredMonth?: number;
  preferredDayOfMonth?: number;
  timeWindowLabel?: string;
  jobType?: string;
  category?: string;
  summary?: string;
  estimatedDurationMinutes?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAgreementSummary {
  id: string;
  agreementNumber: string;
  customerId: string;
  customerName: string;
  name: string;
  description?: string;
  status: ServiceAgreementStatus;
  sourceCatalogItemId?: string;
  sourceCatalogSnapshot?: CatalogLineSnapshot;
  sourceEstimateId?: string;
  sourceEstimateLineItemId?: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  billingCadence: ServiceAgreementBillingCadence;
  nextBillingDate?: string;
  billingAmount?: number;
  statusNote?: string;
  activatedAt?: string;
  pausedAt?: string;
  endedAt?: string;
  createdByName: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
  coveredLocations: ServiceAgreementCoveredLocation[];
  coveredEquipment: ServiceAgreementCoveredEquipment[];
  visitTemplates: ServiceAgreementVisitTemplate[];
}

export interface ServiceAgreementsResponse {
  agreements: ServiceAgreementSummary[];
}

export interface ServiceAgreementResponse {
  agreement: ServiceAgreementSummary;
}

export interface ServiceAgreementReferenceDataResponse {
  customers: CustomerAccountSummary[];
  locations: LocationSummary[];
  equipment: EquipmentSummary[];
}

export interface ServiceAgreementVisitTemplateInput {
  title: string;
  frequency: ServiceAgreementVisitFrequency;
  intervalMonths?: number;
  preferredMonth?: number;
  preferredDayOfMonth?: number;
  timeWindowLabel?: string;
  jobType?: string;
  category?: string;
  summary?: string;
  estimatedDurationMinutes?: number;
  isActive?: boolean;
}

export interface CreateServiceAgreementRequest {
  customerId: string;
  name: string;
  description?: string;
  sourceCatalogItemId?: string;
  sourceCatalogSnapshot?: CatalogLineSnapshot;
  sourceEstimateId?: string;
  sourceEstimateLineItemId?: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  billingCadence?: ServiceAgreementBillingCadence;
  nextBillingDate?: string;
  billingAmount?: number;
  coveredLocationIds: string[];
  coveredEquipmentIds?: string[];
  visitTemplates?: ServiceAgreementVisitTemplateInput[];
}

export interface UpdateServiceAgreementRequest {
  name?: string;
  description?: string;
  sourceCatalogItemId?: string;
  sourceCatalogSnapshot?: CatalogLineSnapshot;
  sourceEstimateId?: string;
  sourceEstimateLineItemId?: string;
  startDate?: string;
  endDate?: string;
  renewalDate?: string;
  billingCadence?: ServiceAgreementBillingCadence;
  nextBillingDate?: string;
  billingAmount?: number;
  coveredLocationIds?: string[];
  coveredEquipmentIds?: string[];
  visitTemplates?: ServiceAgreementVisitTemplateInput[];
}

export interface ServiceAgreementStatusChangeRequest {
  occurredAt?: string;
  reason?: string;
}
