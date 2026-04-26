import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type {
  ContactMutationResponse,
  CrmSearchResponse,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerMutationResponse,
  DuplicateCandidate,
  LocationMutationResponse
} from '@bellfield/contracts';
import { ReferenceDataService } from '../company-data/reference-data.service';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import type {
  CreateContactRequestDto,
  CreateCustomerRequestDto,
  CreateLocationRequestDto,
  LinkContactRequestDto,
  ReassignLocationOwnerRequestDto,
  UpdateContactLinkRequestDto,
  UpdateContactRequestDto,
  UpdateCustomerRequestDto,
  UpdateLocationRequestDto
} from './crm.types';

@Injectable()
export class CrmService {
  constructor(
    private readonly referenceDataService: ReferenceDataService,
    private readonly identityAccessService: IdentityAccessService
  ) {}

  async getWorkspace(sessionToken: string): Promise<CrmWorkspaceResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:view', ['office-web']);
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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:view', ['office-web']);
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return { query, results: [] };
    }

    const [customers, locations, contacts] = await Promise.all([
      this.referenceDataService.listCustomers(true),
      this.referenceDataService.listLocations(true),
      this.referenceDataService.listContacts(true)
    ]);

    const activeLocationsByCustomerId = new Map<string, string[]>();

    for (const location of locations) {
      activeLocationsByCustomerId.set(location.customerId, [
        ...(activeLocationsByCustomerId.get(location.customerId) ?? []),
        `${location.name} ${location.addressLine1} ${location.city} ${location.state} ${location.postalCode}`
      ]);
    }

    const results: Array<CrmSearchResult & { score: number }> = [];

    for (const customer of customers) {
      const relatedLocations = activeLocationsByCustomerId.get(customer.id) ?? [];
      const haystack = [
        customer.name,
        customer.billingAddressLine1,
        customer.billingCity,
        customer.billingState,
        customer.billingPostalCode,
        customer.phone,
        customer.email,
        customer.fax,
        ...customer.flags,
        ...relatedLocations
      ];
      const score = scoreSearch(normalizedQuery, haystack);

      if (score > 0) {
        results.push({
          id: customer.id,
          kind: 'customer',
          title: customer.name,
          subtitle: `${customer.billingAddressLine1}, ${customer.billingCity}, ${customer.billingState} ${customer.billingPostalCode}`,
          badges: buildCustomerBadges(customer.isActive, customer.flags),
          phone: customer.phone,
          addressLine1: customer.billingAddressLine1,
          city: customer.billingCity,
          state: customer.billingState,
          postalCode: customer.billingPostalCode,
          isActive: customer.isActive,
          score
        });
      }
    }

    for (const location of locations) {
      const customer = await this.referenceDataService.getCustomerById(location.customerId);
      const haystack = [
        location.name,
        location.addressLine1,
        location.city,
        location.state,
        location.postalCode,
        location.phone,
        location.email,
        location.fax,
        customer.name
      ];
      const score = scoreSearch(normalizedQuery, haystack);

      if (score > 0) {
        results.push({
          id: location.id,
          kind: 'location',
          title: location.name,
          subtitle: `${location.addressLine1}, ${location.city}, ${location.state} ${location.postalCode}`,
          badges: location.isActive ? [] : ['Inactive'],
          phone: location.phone,
          addressLine1: location.addressLine1,
          city: location.city,
          state: location.state,
          postalCode: location.postalCode,
          customerId: customer.id,
          customerName: customer.name,
          isActive: location.isActive,
          score
        });
      }
    }

    for (const contact of contacts) {
      const haystack = [contact.displayName, contact.phone, contact.email, contact.fax, ...contact.tags];
      const score = scoreSearch(normalizedQuery, haystack);

      if (score > 0) {
        results.push({
          id: contact.id,
          kind: 'contact',
          title: contact.displayName,
          subtitle: contact.tags.join(', ') || 'Contact',
          badges: contact.isActive ? [] : ['Inactive'],
          phone: contact.phone,
          isActive: contact.isActive,
          score
        });
      }
    }

    return {
      query,
      results: results
        .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
        .map(({ score: _score, ...result }) => result)
    };
  }

  async getCustomerDetail(sessionToken: string, customerId: string) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:view', ['office-web']);
    return this.referenceDataService.getCustomerDetail(customerId);
  }

  async getLocationDetail(sessionToken: string, locationId: string) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'locations:view', ['office-web']);
    return this.referenceDataService.getLocationDetail(locationId);
  }

  async getContactDetail(sessionToken: string, contactId: string) {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:view', ['office-web']);
    return this.referenceDataService.getContactDetail(contactId);
  }

  async createCustomer(sessionToken: string, request: CreateCustomerRequestDto): Promise<CustomerMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:create', ['office-web']);
    ensureAtLeastOneContactMethod(request.phone, request.email, request.fax, 'Customer accounts');
    const duplicateWarnings = await this.findCustomerDuplicates(request);
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'customer account');

    const customer = await this.referenceDataService.createCustomer({
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
    });

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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'customers:edit', ['office-web']);
    const current = await this.referenceDataService.getCustomerById(customerId);
    ensureAtLeastOneContactMethod(
      request.phone ?? current.phone,
      request.email ?? current.email,
      request.fax ?? current.fax,
      'Customer accounts'
    );
    const duplicateWarnings = await this.findCustomerDuplicates({ ...current, ...request }, customerId);
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'customer account');

    const customer = await this.referenceDataService.updateCustomer(customerId, {
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
    });

    return {
      customer,
      ...(duplicateWarnings.length > 0 ? { duplicateWarnings } : {})
    };
  }

  async createLocation(sessionToken: string, request: CreateLocationRequestDto): Promise<LocationMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'locations:create', ['office-web']);
    ensureAtLeastOneContactMethod(request.phone, request.email, request.fax, 'Locations');
    await this.referenceDataService.getCustomerById(request.customerId);
    if (request.alternateBillToCustomerIds?.length) {
      await Promise.all(request.alternateBillToCustomerIds.map((customerId) => this.referenceDataService.getCustomerById(customerId)));
    }
    const duplicateWarnings = await this.findLocationDuplicates(request);
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'location');

    const location = await this.referenceDataService.createLocation({
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
    });

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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'locations:edit', ['office-web']);
    const current = await this.referenceDataService.getLocationById(locationId);
    ensureAtLeastOneContactMethod(
      request.phone ?? current.phone,
      request.email ?? current.email,
      request.fax ?? current.fax,
      'Locations'
    );
    if (request.alternateBillToCustomerIds?.length) {
      await Promise.all(request.alternateBillToCustomerIds.map((customerId) => this.referenceDataService.getCustomerById(customerId)));
    }
    const duplicateWarnings = await this.findLocationDuplicates({ ...current, ...request }, locationId);
    this.ensureDuplicateConfirmation(duplicateWarnings, request.confirmDuplicate, 'location');

    const location = await this.referenceDataService.updateLocation(locationId, {
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
    });

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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'locations:edit', ['office-web']);
    await this.referenceDataService.getCustomerById(request.customerId);
    const location = await this.referenceDataService.reassignLocationOwner(locationId, request.customerId, request.note?.trim());
    return { location };
  }

  async createContact(sessionToken: string, request: CreateContactRequestDto): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:create', ['office-web']);
    ensureAtLeastOneContactMethod(request.phone, request.email, request.fax, 'Contacts');
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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', ['office-web']);

    if (request.scope === 'global') {
      const current = await this.referenceDataService.getContactById(contactId);
      ensureAtLeastOneContactMethod(
        request.phone ?? current.phone,
        request.email ?? current.email,
        request.fax ?? current.fax,
        'Contacts'
      );
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
      throw new ConflictException('Local-only contact edits may change phone, email, fax, or tags, but not the shared display name.');
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

  async linkContact(sessionToken: string, request: LinkContactRequestDto): Promise<ContactMutationResponse> {
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', ['office-web']);
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
    await this.identityAccessService.getAuthorizedEmployee(sessionToken, 'contacts:edit', ['office-web']);
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
    const customers = await this.referenceDataService.listCustomers(true);
    const normalizedName = normalize(request.name);
    const normalizedPhone = normalizePhone(request.phone);
    const normalizedAddress = normalize(
      `${request.billingAddressLine1 ?? ''} ${request.billingCity ?? ''} ${request.billingState ?? ''} ${request.billingPostalCode ?? ''}`
    );

    return customers
      .filter((customer) => customer.id !== excludedCustomerId)
      .flatMap((customer) => {
        const matchReasons: string[] = [];

        if (normalizedName && normalize(customer.name) === normalizedName) {
          matchReasons.push('Same customer name');
        }

        if (normalizedPhone && normalizePhone(customer.phone) === normalizedPhone) {
          matchReasons.push('Same phone number');
        }

        const customerAddress = normalize(
          `${customer.billingAddressLine1} ${customer.billingCity} ${customer.billingState} ${customer.billingPostalCode}`
        );

        if (normalizedAddress && customerAddress === normalizedAddress) {
          matchReasons.push('Same billing address');
        }

        if (matchReasons.length === 0) {
          return [];
        }

        return [{
          id: customer.id,
          kind: 'customer' as const,
          title: customer.name,
          subtitle: `${customer.billingAddressLine1}, ${customer.billingCity}, ${customer.billingState} ${customer.billingPostalCode}`,
          matchReasons,
          isActive: customer.isActive,
          hasDoNotServiceFlag: hasDoNotService(customer.flags)
        } satisfies DuplicateCandidate];
      });
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
    const locations = await this.referenceDataService.listLocations(true);
    const normalizedName = normalize(request.name);
    const normalizedPhone = normalizePhone(request.phone);
    const normalizedAddress = normalize(
      `${request.addressLine1 ?? ''} ${request.city ?? ''} ${request.state ?? ''} ${request.postalCode ?? ''}`
    );

    const candidates = await Promise.all(
      locations
        .filter((location) => location.id !== excludedLocationId)
        .map(async (location) => {
          const matchReasons: string[] = [];

          if (normalizedName && normalize(location.name) === normalizedName) {
            matchReasons.push('Same location name');
          }

          if (normalizedPhone && normalizePhone(location.phone) === normalizedPhone) {
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

          const customer = await this.referenceDataService.getCustomerById(location.customerId);

          return {
            id: location.id,
            kind: 'location' as const,
            title: location.name,
            subtitle: `${location.addressLine1}, ${location.city}, ${location.state} ${location.postalCode} (${customer.name})`,
            matchReasons,
            isActive: location.isActive,
            hasDoNotServiceFlag: hasDoNotService(customer.flags)
          } satisfies DuplicateCandidate;
        })
    );

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
      throw new ConflictException(`Possible duplicate ${label} found. Review the matches and confirm before continuing.`);
    }
  }
}

function ensureAtLeastOneContactMethod(
  phone: string | undefined,
  email: string | undefined,
  fax: string | undefined,
  label: string
): void {
  if (!trimOptional(phone) && !trimOptional(email) && !trimOptional(fax)) {
    throw new ConflictException(`${label} need at least one contact method such as phone, email, or fax.`);
  }
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalize(value: string | undefined): string {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function normalizePhone(value: string | undefined): string {
  return value?.replace(/\D/g, '') ?? '';
}

function scoreSearch(query: string, values: Array<string | undefined>): number {
  const normalizedQuery = normalize(query);
  const normalizedPhoneQuery = normalizePhone(query);

  return values.reduce((score, value) => {
    if (!value) {
      return score;
    }

    const normalizedValue = normalize(value);
    const normalizedPhoneValue = normalizePhone(value);

    if (normalizedQuery && normalizedValue.includes(normalizedQuery)) {
      return score + (normalizedValue === normalizedQuery ? 4 : 2);
    }

    if (normalizedPhoneQuery && normalizedPhoneValue.includes(normalizedPhoneQuery)) {
      return score + (normalizedPhoneValue === normalizedPhoneQuery ? 4 : 2);
    }

    return score;
  }, 0);
}

function buildCustomerBadges(isActive: boolean, flags: string[]): string[] {
  const badges: string[] = [];

  if (!isActive) {
    badges.push('Inactive');
  }

  if (hasDoNotService(flags)) {
    badges.push('DNU');
  }

  return badges;
}

function hasDoNotService(flags: string[]): boolean {
  return flags.some((flag) => flag.toLowerCase().includes('do not service'));
}

function toSupportedAccountType(accountType: string): 'residential' | 'company' | 'propertyManager' | 'landlord' {
  if (accountType === 'residential' || accountType === 'company' || accountType === 'propertyManager' || accountType === 'landlord') {
    return accountType;
  }

  throw new ForbiddenException('Unsupported customer account type.');
}
