import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import type {
  ContactMutationResponse,
  ContactMethodMutationResponse,
  ContactMethodSummary,
  CrmSearchResponse,
  CrmWorkspaceResponse,
  CustomerMutationResponse,
  DuplicateCandidate,
  LocationDetail,
  LocationMutationResponse
} from '@bellfield/contracts';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  CreateContactRequestDto,
  CreateCustomerRequestDto,
  CreateLocationRequestDto,
  LinkContactRequestDto,
  CreateContactMethodRequestDto,
  ReassignLocationOwnerRequestDto,
  UpdateContactMethodRequestDto,
  UpdateContactLinkRequestDto,
  UpdateContactRequestDto,
  UpdateCustomerRequestDto,
  UpdateLocationRequestDto
} from './crm.types';

const crmSearchLimit = 25;
const duplicateCandidateLimit = 25;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class CrmService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(sessionToken: string): Promise<CrmWorkspaceResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:view', [
      'office-web'
    ]);
    const [customers, contacts, locations] = await Promise.all([
      this.referenceDataService.listCustomers(false),
      this.referenceDataService.listContacts(false),
      this.referenceDataService.listLocations(false)
    ]);

    return {
      customers: customers.map((customer) => ({ ...customer, flags: [...customer.flags] })),
      contacts: contacts.map((contact) => ({ ...contact, tags: [...contact.tags] })),
      locations: locations.map((location) => ({
        id: location.id,
        name: location.name,
        addressLine1: location.addressLine1,
        city: location.city,
        state: location.state,
        postalCode: location.postalCode,
        isActive: location.isActive
      }))
    };
  }

  async search(sessionToken: string, query: string): Promise<CrmSearchResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:view', [
      'office-web'
    ]);
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return { query, results: [] };
    }

    const results = await this.referenceDataService.searchCrm(normalizedQuery, crmSearchLimit);

    return {
      query,
      results: results.map(({ score: _score, ...result }) => result)
    };
  }

  async getCustomerDetail(sessionToken: string, customerId: string) {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'customers:view',
      ['office-web']
    );
    return this.referenceDataService.getCustomerDetail(customerId, detailOptionsFor(employee));
  }

  async getLocationDetail(sessionToken: string, locationId: string) {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'locations:view',
      ['office-web']
    );
    return this.referenceDataService.getLocationDetail(locationId, detailOptionsFor(employee));
  }

  async getContactDetail(sessionToken: string, contactId: string) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:view', [
      'office-web'
    ]);
    return this.referenceDataService.getContactDetail(contactId);
  }

  async createCustomer(
    sessionToken: string,
    request: CreateCustomerRequestDto
  ): Promise<CustomerMutationResponse> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'customers:create',
      ['office-web']
    );
    const duplicateWarnings = await this.findCustomerDuplicates(request);
    this.ensureDuplicateConfirmation(
      duplicateWarnings,
      request.confirmDuplicate,
      'customer account'
    );

    const customer = await this.referenceDataService.createCustomer(
      {
        name: request.name.trim(),
        accountType: toSupportedAccountType(request.accountType),
        isActive: true,
        billingAddressLine1: request.billingAddressLine1.trim(),
        billingCity: request.billingCity.trim(),
        billingState: request.billingState.trim(),
        billingPostalCode: request.billingPostalCode.trim(),
        phone: trimOptional(request.phone),
        email: trimOptional(request.email),
        fax: trimOptional(request.fax),
        flags: (request.flags ?? []).map((flag) => flag.trim()).filter(Boolean)
      },
      detailOptionsFor(employee)
    );

    return {
      customer,
      ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {})
    };
  }

  async updateCustomer(
    sessionToken: string,
    customerId: string,
    request: UpdateCustomerRequestDto
  ): Promise<CustomerMutationResponse> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'customers:edit',
      ['office-web']
    );
    const current = await this.referenceDataService.getCustomerById(customerId);
    const duplicateWarnings = await this.findCustomerDuplicates(
      { ...current, ...request },
      customerId
    );
    this.ensureDuplicateConfirmation(
      duplicateWarnings,
      request.confirmDuplicate,
      'customer account'
    );

    const customer = await this.referenceDataService.updateCustomer(
      customerId,
      {
        name: request.name?.trim(),
        accountType: request.accountType ? toSupportedAccountType(request.accountType) : undefined,
        billingAddressLine1: request.billingAddressLine1?.trim(),
        billingCity: request.billingCity?.trim(),
        billingState: request.billingState?.trim(),
        billingPostalCode: request.billingPostalCode?.trim(),
        phone: request.phone !== undefined ? trimOptional(request.phone) : undefined,
        email: request.email !== undefined ? trimOptional(request.email) : undefined,
        fax: request.fax !== undefined ? trimOptional(request.fax) : undefined,
        isActive: request.isActive,
        flags: request.flags?.map((flag) => flag.trim()).filter(Boolean)
      },
      detailOptionsFor(employee)
    );

    return {
      customer,
      ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {})
    };
  }

  async createLocation(
    sessionToken: string,
    request: CreateLocationRequestDto
  ): Promise<LocationMutationResponse> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'locations:create',
      ['office-web']
    );
    ensureLocationContactConfirmation(
      request.phone,
      request.email,
      request.confirmMissingContactInfo
    );
    await this.referenceDataService.getCustomerById(request.customerId);
    if (request.alternateBillToCustomerIds?.length) {
      await Promise.all(
        request.alternateBillToCustomerIds.map((customerId) =>
          this.referenceDataService.getCustomerById(customerId)
        )
      );
    }
    const duplicateWarnings = await this.findLocationDuplicates(request);
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'location');

    const location = await this.referenceDataService.createLocation(
      {
        customerId: request.customerId,
        name: request.name.trim(),
        addressLine1: request.addressLine1.trim(),
        city: request.city.trim(),
        state: request.state.trim(),
        postalCode: request.postalCode.trim(),
        phone: trimOptional(request.phone),
        email: trimOptional(request.email),
        fax: trimOptional(request.fax),
        isActive: true,
        alternateBillToCustomerIds: request.alternateBillToCustomerIds ?? []
      },
      detailOptionsFor(employee)
    );

    return {
      location,
      ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {})
    };
  }

  async updateLocation(
    sessionToken: string,
    locationId: string,
    request: UpdateLocationRequestDto
  ): Promise<LocationMutationResponse> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'locations:edit',
      ['office-web']
    );
    const current = await this.referenceDataService.getLocationById(locationId);
    const currentDetail = await this.referenceDataService.getLocationDetail(locationId);
    ensureLocationContactConfirmation(
      request.phone ?? current.phone,
      request.email ?? current.email,
      request.confirmMissingContactInfo,
      hasActivePhoneOrEmailMethod(currentDetail.contactMethods)
    );
    if (request.alternateBillToCustomerIds?.length) {
      await Promise.all(
        request.alternateBillToCustomerIds.map((customerId) =>
          this.referenceDataService.getCustomerById(customerId)
        )
      );
    }
    const duplicateWarnings = await this.findLocationDuplicates(
      { ...current, ...request },
      locationId
    );
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'location');

    const location = await this.referenceDataService.updateLocation(
      locationId,
      {
        name: request.name?.trim(),
        addressLine1: request.addressLine1?.trim(),
        city: request.city?.trim(),
        state: request.state?.trim(),
        postalCode: request.postalCode?.trim(),
        phone: request.phone !== undefined ? trimOptional(request.phone) : undefined,
        email: request.email !== undefined ? trimOptional(request.email) : undefined,
        fax: request.fax !== undefined ? trimOptional(request.fax) : undefined,
        isActive: request.isActive,
        alternateBillToCustomerIds: request.alternateBillToCustomerIds
      },
      detailOptionsFor(employee)
    );

    return {
      location,
      ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {})
    };
  }

  async reassignLocationOwner(
    sessionToken: string,
    locationId: string,
    request: ReassignLocationOwnerRequestDto
  ): Promise<LocationMutationResponse> {
    const employee = await this.identityAccessService.getAuthorizedEmployee(
      sessionToken,
      'locations:edit',
      ['office-web']
    );
    const effectiveDate = normalizeDateOnly(request.effectiveDate);
    if (effectiveDate > todayDateString()) {
      throw new BadRequestException('Future ownership transfer dates are not supported yet.');
    }

    const [targetCustomer, currentLocation] = await Promise.all([
      this.referenceDataService.getCustomerById(request.customerId),
      this.referenceDataService.getLocationDetail(locationId)
    ]);

    if (!targetCustomer.isActive) {
      throw new ConflictException('Target customer account is inactive.');
    }

    if (currentLocation.customerId === targetCustomer.id) {
      throw new ConflictException('Location is already owned by this customer.');
    }

    assertEffectiveDateWithinCurrentOwnership(currentLocation, effectiveDate);

    const location = await this.referenceDataService.reassignLocationOwner(
      locationId,
      targetCustomer.id,
      effectiveDate,
      request.note?.trim(),
      detailOptionsFor(employee)
    );
    return { location };
  }

  async createCustomerContactMethod(
    sessionToken: string,
    customerId: string,
    request: CreateContactMethodRequestDto
  ): Promise<ContactMethodMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:edit', [
      'office-web'
    ]);
    await this.referenceDataService.getCustomerById(customerId);
    return this.referenceDataService.createContactMethod({
      ownerKind: 'customer',
      ownerId: customerId,
      kind: request.kind,
      label: request.label.trim(),
      value: request.value.trim(),
      isPrimary: request.isPrimary ?? false,
      isActive: true
    });
  }

  async createLocationContactMethod(
    sessionToken: string,
    locationId: string,
    request: CreateContactMethodRequestDto
  ): Promise<ContactMethodMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'locations:edit', [
      'office-web'
    ]);
    await this.referenceDataService.getLocationById(locationId);
    return this.referenceDataService.createContactMethod({
      ownerKind: 'location',
      ownerId: locationId,
      kind: request.kind,
      label: request.label.trim(),
      value: request.value.trim(),
      isPrimary: request.isPrimary ?? false,
      isActive: true
    });
  }

  async createContactContactMethod(
    sessionToken: string,
    contactId: string,
    request: CreateContactMethodRequestDto
  ): Promise<ContactMethodMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', [
      'office-web'
    ]);
    await this.referenceDataService.getContactById(contactId);
    return this.referenceDataService.createContactMethod({
      ownerKind: 'contact',
      ownerId: contactId,
      kind: request.kind,
      label: request.label.trim(),
      value: request.value.trim(),
      isPrimary: request.isPrimary ?? false,
      isActive: true
    });
  }

  async updateContactMethod(
    sessionToken: string,
    contactMethodId: string,
    request: UpdateContactMethodRequestDto
  ): Promise<ContactMethodMutationResponse> {
    const contactMethod = await this.referenceDataService.getContactMethodById(contactMethodId);
    const permission =
      contactMethod.ownerKind === 'customer'
        ? 'customers:edit'
        : contactMethod.ownerKind === 'location'
          ? 'locations:edit'
          : 'contacts:edit';
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, permission, [
      'office-web'
    ]);
    return this.referenceDataService.updateContactMethod(contactMethodId, {
      label: request.label?.trim(),
      value: request.value?.trim(),
      isPrimary: request.isPrimary,
      isActive: request.isActive
    });
  }

  async createContact(
    sessionToken: string,
    request: CreateContactRequestDto
  ): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:create', [
      'office-web'
    ]);
    const contact = await this.referenceDataService.createContact({
      displayName: request.displayName.trim(),
      phone: trimOptional(request.phone),
      email: trimOptional(request.email),
      fax: trimOptional(request.fax),
      tags: (request.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      isActive: true
    });

    return { contact };
  }

  async updateContact(
    sessionToken: string,
    contactId: string,
    request: UpdateContactRequestDto
  ): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', [
      'office-web'
    ]);

    if (request.scope === 'global') {
      await this.referenceDataService.getContactById(contactId);
      const contact = await this.referenceDataService.updateContact(contactId, {
        displayName: request.displayName?.trim(),
        phone: request.phone !== undefined ? trimOptional(request.phone) : undefined,
        email: request.email !== undefined ? trimOptional(request.email) : undefined,
        fax: request.fax !== undefined ? trimOptional(request.fax) : undefined,
        tags: request.tags?.map((tag) => tag.trim()).filter(Boolean)
      });
      return { contact };
    }

    if (request.displayName) {
      throw new ConflictException(
        'Local-only contact edits may change phone, email, fax, or tags, but not the shared display name.'
      );
    }

    if (!request.linkId) {
      throw new ConflictException('A linkId is required for a local-only contact update.');
    }

    return this.referenceDataService.updateContactLink(request.linkId, {
      phone: request.phone !== undefined ? trimOptional(request.phone) : undefined,
      email: request.email !== undefined ? trimOptional(request.email) : undefined,
      fax: request.fax !== undefined ? trimOptional(request.fax) : undefined,
      tags: request.tags?.map((tag) => tag.trim()).filter(Boolean)
    });
  }

  async linkContact(
    sessionToken: string,
    request: LinkContactRequestDto
  ): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', [
      'office-web'
    ]);
    await this.referenceDataService.getContactById(request.contactId);

    if (!request.customerId && !request.locationId) {
      throw new ConflictException('Linking a contact requires a customer or location target.');
    }

    if (request.customerId && request.locationId) {
      throw new ConflictException('Link contacts to one customer or one location at a time.');
    }

    if (request.customerId) {
      await this.referenceDataService.getCustomerById(request.customerId);
      return this.referenceDataService.linkContact({
        contactId: request.contactId,
        linkedRecordId: request.customerId,
        linkedRecordKind: 'customer',
        tags: (request.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
        isActive: true
      });
    }

    await this.referenceDataService.getLocationById(request.locationId as string);
    return this.referenceDataService.linkContact({
      contactId: request.contactId,
      linkedRecordId: request.locationId as string,
      linkedRecordKind: 'location',
      tags: (request.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
      isActive: true
    });
  }

  async updateContactLink(
    sessionToken: string,
    linkId: string,
    request: UpdateContactLinkRequestDto
  ): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', [
      'office-web'
    ]);
    return this.referenceDataService.updateContactLink(linkId, {
      tags: request.tags?.map((tag) => tag.trim()).filter(Boolean),
      endDate: request.endDate,
      isActive: request.isActive
    });
  }

  private async findCustomerDuplicates(
    request: {
      name?: string;
      billingAddressLine1?: string;
      billingCity?: string;
      billingState?: string;
      billingPostalCode?: string;
      phone?: string;
    },
    excludedCustomerId?: string
  ): Promise<DuplicateCandidate[]> {
    const normalizedName = normalize(request.name);
    const normalizedPhone = normalizePhone(request.phone);
    const normalizedAddress = normalize(
      `${request.billingAddressLine1 ?? ''} ${request.billingCity ?? ''} ${request.billingState ?? ''} ${request.billingPostalCode ?? ''}`
    );
    const customers = await this.referenceDataService.findCustomerDuplicateCandidates({
      normalizedName,
      normalizedPhone,
      normalizedAddress,
      excludedCustomerId,
      limit: duplicateCandidateLimit
    });

    const contactMethodsByCustomerId = new Map(
      await Promise.all(
        customers.map(
          async (customer) =>
            [
              customer.id,
              (await this.referenceDataService.getCustomerDetail(customer.id)).contactMethods
            ] as const
        )
      )
    );

    const candidates = customers.map((customer) => {
      const matchReasons: string[] = [];
      const contactMethods = contactMethodsByCustomerId.get(customer.id) ?? [];

      if (normalizedName && normalize(customer.name) === normalizedName) {
        matchReasons.push('Same customer name');
      }

      if (
        normalizedPhone &&
        (normalizePhone(customer.phone) === normalizedPhone ||
          contactMethodsContainPhone(contactMethods, normalizedPhone))
      ) {
        matchReasons.push('Same phone number');
      }

      const customerAddress = normalize(
        `${customer.billingAddressLine1} ${customer.billingCity} ${customer.billingState} ${customer.billingPostalCode}`
      );

      if (normalizedAddress && customerAddress === normalizedAddress) {
        matchReasons.push('Same billing address');
      }

      if (matchReasons.length === 0) {
        return null;
      }

      return {
        id: customer.id,
        kind: 'customer' as const,
        title: customer.name,
        subtitle: `${customer.billingAddressLine1}, ${customer.billingCity}, ${customer.billingState} ${customer.billingPostalCode}`,
        matchReasons,
        isActive: customer.isActive,
        hasDoNotServiceFlag: hasDoNotService(customer.flags)
      } satisfies DuplicateCandidate;
    });

    return candidates.filter(
      (candidate): candidate is Exclude<(typeof candidates)[number], null> => candidate !== null
    );
  }

  private async findLocationDuplicates(
    request: {
      name?: string;
      addressLine1?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      phone?: string;
    },
    excludedLocationId?: string
  ): Promise<DuplicateCandidate[]> {
    const normalizedName = normalize(request.name);
    const normalizedPhone = normalizePhone(request.phone);
    const normalizedAddress = normalize(
      `${request.addressLine1 ?? ''} ${request.city ?? ''} ${request.state ?? ''} ${request.postalCode ?? ''}`
    );
    const locations = await this.referenceDataService.findLocationDuplicateCandidates({
      normalizedName,
      normalizedPhone,
      normalizedAddress,
      excludedLocationId,
      limit: duplicateCandidateLimit
    });

    const contactMethodsByLocationId = new Map(
      await Promise.all(
        locations.map(
          async (location) =>
            [
              location.id,
              (await this.referenceDataService.getLocationDetail(location.id)).contactMethods
            ] as const
        )
      )
    );

    const candidates = locations.map((location) => {
      const matchReasons: string[] = [];
      const contactMethods = contactMethodsByLocationId.get(location.id) ?? [];

      if (normalizedName && normalize(location.name) === normalizedName) {
        matchReasons.push('Same location name');
      }

      if (
        normalizedPhone &&
        (normalizePhone(location.phone) === normalizedPhone ||
          contactMethodsContainPhone(contactMethods, normalizedPhone))
      ) {
        matchReasons.push('Same phone number');
      }

      const locationAddress = normalize(
        `${location.addressLine1} ${location.city} ${location.state} ${location.postalCode}`
      );

      if (normalizedAddress && locationAddress === normalizedAddress) {
        matchReasons.push('Same service address');
      }

      if (matchReasons.length === 0) {
        return null;
      }

      return {
        id: location.id,
        kind: 'location' as const,
        title: location.name,
        subtitle: `${location.addressLine1}, ${location.city}, ${location.state} ${location.postalCode} (${location.customerName})`,
        matchReasons,
        isActive: location.isActive,
        hasDoNotServiceFlag: hasDoNotService(location.customerFlags)
      } satisfies DuplicateCandidate;
    });

    return candidates.filter(
      (candidate): candidate is Exclude<(typeof candidates)[number], null> => candidate !== null
    );
  }

  private ensureDuplicateConfirmation(
    duplicateWarnings: DuplicateCandidate[],
    confirmDuplicate: boolean | undefined,
    label: string
  ): void {
    if (duplicateWarnings.length > 0 && !confirmDuplicate) {
      throw new ConflictException(
        `Possible duplicate ${label} found. Review the matches and confirm before continuing.`
      );
    }
  }
}

function ensureLocationContactConfirmation(
  phone: string | undefined,
  email: string | undefined,
  confirmMissingContactInfo: boolean | undefined,
  hasActiveContactMethod = false
): void {
  if (
    !trimOptional(phone) &&
    !trimOptional(email) &&
    !hasActiveContactMethod &&
    !confirmMissingContactInfo
  ) {
    throw new ConflictException(
      'Locations without phone or email need office confirmation before saving.'
    );
  }
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeDateOnly(value: string): string {
  const trimmed = value.trim();

  if (!isoDatePattern.test(trimmed)) {
    throw new BadRequestException('Effective date must use YYYY-MM-DD format.');
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    throw new BadRequestException('Effective date must be a real calendar date.');
  }

  return trimmed;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertEffectiveDateWithinCurrentOwnership(
  location: LocationDetail,
  effectiveDate: string
): void {
  const activeOwnership = location.ownershipHistory.find((entry) => !entry.endedAt);
  const activeStartDate = activeOwnership?.startedAt.slice(0, 10);

  if (activeStartDate && effectiveDate < activeStartDate) {
    throw new BadRequestException(
      'Effective date cannot be before the current ownership start date.'
    );
  }
}

function normalize(value: string | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function normalizePhone(value: string | undefined): string {
  return value?.replace(/\D/g, '') ?? '';
}

function contactMethodsContainPhone(
  contactMethods: ContactMethodSummary[],
  normalizedPhone: string
): boolean {
  return contactMethods.some(
    (method) =>
      method.isActive &&
      (method.kind === 'phone' || method.kind === 'fax') &&
      normalizePhone(method.value) === normalizedPhone
  );
}

function hasActivePhoneOrEmailMethod(contactMethods: ContactMethodSummary[]): boolean {
  return contactMethods.some(
    (method) => method.isActive && (method.kind === 'phone' || method.kind === 'email')
  );
}

function hasDoNotService(flags: string[]): boolean {
  return flags.some((flag) => flag.toLowerCase().includes('do not service'));
}

function detailOptionsFor(employee: { effectivePermissions: readonly string[] }) {
  return {
    includeAgreementContext: employee.effectivePermissions.includes('agreements:view')
  };
}

function toSupportedAccountType(
  accountType: string
): 'residential' | 'company' | 'propertyManager' | 'landlord' {
  if (
    accountType === 'residential' ||
    accountType === 'company' ||
    accountType === 'propertyManager' ||
    accountType === 'landlord'
  ) {
    return accountType;
  }

  throw new ForbiddenException('Unsupported customer account type.');
}
