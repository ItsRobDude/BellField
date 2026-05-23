import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  ContactDetail,
  ContactLink,
  ContactMutationResponse,
  ContactSummary,
  CustomerDetail,
  CustomerLocationListItem,
  LinkedRecordSummary,
  LocationDetail,
  OwnershipHistoryEntry
} from '@bellfield/contracts';
import type {
  ContactLinkRecord,
  ContactRecord,
  CrmSearchRecord,
  CustomerDuplicateLookupInput,
  CustomerAccountRecord,
  LocationDuplicateCandidateRecord,
  LocationDuplicateLookupInput,
  LocationRecord
} from './company-data.types';
import { ReferenceDataRepository } from './reference-data.repository';

@Injectable()
export class ReferenceDataService {
  constructor(private readonly referenceDataRepository: ReferenceDataRepository) {}

  async listCustomers(includeInactive = false): Promise<CustomerAccountRecord[]> {
    return this.referenceDataRepository.listCustomers(includeInactive);
  }

  async listContacts(includeInactive = false): Promise<ContactRecord[]> {
    return this.referenceDataRepository.listContacts(includeInactive);
  }

  async listLocations(includeInactive = false): Promise<LocationRecord[]> {
    return this.referenceDataRepository.listLocations(includeInactive);
  }

  async searchCrm(query: string, limit: number): Promise<CrmSearchRecord[]> {
    return this.referenceDataRepository.searchCrm(query, limit);
  }

  async findCustomerDuplicateCandidates(input: CustomerDuplicateLookupInput): Promise<CustomerAccountRecord[]> {
    return this.referenceDataRepository.findCustomerDuplicateCandidates(input);
  }

  async findLocationDuplicateCandidates(
    input: LocationDuplicateLookupInput
  ): Promise<LocationDuplicateCandidateRecord[]> {
    return this.referenceDataRepository.findLocationDuplicateCandidates(input);
  }

  async getLocationById(locationId: string): Promise<LocationRecord> {
    const location = await this.referenceDataRepository.getLocationById(locationId);

    if (!location) {
      throw new NotFoundException('Location not found.');
    }

    return location;
  }

  async getCustomerById(customerId: string): Promise<CustomerAccountRecord> {
    const customer = await this.referenceDataRepository.getCustomerById(customerId);

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    return customer;
  }

  async getContactById(contactId: string): Promise<ContactRecord> {
    const contact = await this.referenceDataRepository.getContactById(contactId);

    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }

    return contact;
  }

  async getCustomerDetail(customerId: string): Promise<CustomerDetail> {
    const customer = await this.getCustomerById(customerId);
    const [links, locations] = await Promise.all([
      this.referenceDataRepository.listCustomerContactLinks(customerId, true),
      this.referenceDataRepository.listLocationsForCustomer(customerId, true)
    ]);

    return {
      ...customer,
      contacts: await Promise.all(
        links.map((link) =>
          this.toContactLinkSummary(link, {
            id: customer.id,
            kind: 'customer',
            name: customer.name,
            subtitle: formatCustomerSubtitle(customer)
          })
        )
      ),
      locations: locations.map((location) => this.toCustomerLocationListItem(location))
    };
  }

  async getLocationDetail(locationId: string): Promise<LocationDetail> {
    const location = await this.getLocationById(locationId);
    const customer = await this.getCustomerById(location.customerId);
    const [links, ownershipHistory] = await Promise.all([
      this.referenceDataRepository.listLocationContactLinks(locationId, true),
      this.referenceDataRepository.listOwnershipHistory(locationId)
    ]);

    return {
      id: location.id,
      name: location.name,
      customerId: customer.id,
      customerName: customer.name,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      phone: location.phone,
      email: location.email,
      fax: location.fax,
      isActive: location.isActive,
      contacts: await Promise.all(
        links.map((link) =>
          this.toContactLinkSummary(link, {
            id: location.id,
            kind: 'location',
            name: location.name,
            subtitle: formatLocationSubtitle(location)
          })
        )
      ),
      alternateBillToCustomerIds: [...location.alternateBillToCustomerIds],
      ownershipHistory: await Promise.all(ownershipHistory.map((entry) => this.toOwnershipHistoryEntry(entry)))
    };
  }

  async getContactDetail(contactId: string): Promise<ContactDetail> {
    const contact = await this.getContactById(contactId);
    const links = await this.referenceDataRepository.listContactLinksForContact(contactId, true);

    return {
      ...contact,
      linkedRecords: await Promise.all(
        links.map(async (link) => {
          const linkedRecord = await this.toLinkedRecordSummary(link);
          return this.toContactLinkSummary(link, linkedRecord);
        })
      )
    };
  }

  async createCustomer(customer: Omit<CustomerAccountRecord, 'id'>): Promise<CustomerDetail> {
    const createdCustomer = await this.referenceDataRepository.createCustomer(customer);
    return this.getCustomerDetail(createdCustomer.id);
  }

  async updateCustomer(customerId: string, customer: Partial<Omit<CustomerAccountRecord, 'id'>>): Promise<CustomerDetail> {
    const updatedCustomer = await this.referenceDataRepository.updateCustomer(customerId, customer);

    if (!updatedCustomer) {
      throw new NotFoundException('Customer account not found.');
    }

    return this.getCustomerDetail(updatedCustomer.id);
  }

  async createLocation(location: Omit<LocationRecord, 'id'>): Promise<LocationDetail> {
    const createdLocation = await this.referenceDataRepository.createLocation(location);
    await this.referenceDataRepository.addOwnershipHistoryEntry({
      locationId: createdLocation.id,
      customerId: createdLocation.customerId,
      startedAt: new Date().toISOString()
    });
    return this.getLocationDetail(createdLocation.id);
  }

  async updateLocation(locationId: string, location: Partial<Omit<LocationRecord, 'id' | 'customerId'>>): Promise<LocationDetail> {
    const updatedLocation = await this.referenceDataRepository.updateLocation(locationId, location);

    if (!updatedLocation) {
      throw new NotFoundException('Location not found.');
    }

    return this.getLocationDetail(updatedLocation.id);
  }

  async reassignLocationOwner(locationId: string, customerId: string, note?: string): Promise<LocationDetail> {
    const updatedLocation = await this.referenceDataRepository.reassignLocationOwner(locationId, customerId, note);

    if (!updatedLocation) {
      throw new NotFoundException('Location not found.');
    }

    return this.getLocationDetail(updatedLocation.id);
  }

  async createContact(contact: Omit<ContactRecord, 'id'>): Promise<ContactDetail> {
    const createdContact = await this.referenceDataRepository.createContact(contact);
    return this.getContactDetail(createdContact.id);
  }

  async updateContact(contactId: string, contact: Partial<Omit<ContactRecord, 'id'>>): Promise<ContactDetail> {
    const updatedContact = await this.referenceDataRepository.updateContact(contactId, contact);

    if (!updatedContact) {
      throw new NotFoundException('Contact not found.');
    }

    return this.getContactDetail(updatedContact.id);
  }

  async linkContact(link: Omit<ContactLinkRecord, 'id'>): Promise<ContactMutationResponse> {
    const createdLink = await this.referenceDataRepository.createContactLink(link);
    return {
      contact: await this.getContactDetail(createdLink.contactId)
    };
  }

  async updateContactLink(linkId: string, update: Partial<Omit<ContactLinkRecord, 'id' | 'contactId' | 'linkedRecordId' | 'linkedRecordKind'>>): Promise<ContactMutationResponse> {
    const updatedLink = await this.referenceDataRepository.updateContactLink(linkId, update);

    if (!updatedLink) {
      throw new NotFoundException('Contact link not found.');
    }

    return {
      contact: await this.getContactDetail(updatedLink.contactId)
    };
  }

  private async toOwnershipHistoryEntry(record: {
    id: string;
    customerId: string;
    startedAt: string;
    endedAt?: string;
    note?: string;
  }): Promise<OwnershipHistoryEntry> {
    const customer = await this.getCustomerById(record.customerId);

    return {
      id: record.id,
      customerId: customer.id,
      customerName: customer.name,
      startedAt: record.startedAt,
      endedAt: record.endedAt,
      note: record.note
    };
  }

  private async toContactLinkSummary(link: ContactLinkRecord, linkedRecord: LinkedRecordSummary): Promise<ContactLink> {
    const contact = await this.getContactById(link.contactId);

    return {
      id: link.id,
      contactId: contact.id,
      displayName: contact.displayName,
      phone: link.phone ?? contact.phone,
      email: link.email ?? contact.email,
      fax: link.fax ?? contact.fax,
      tags: link.tags.length > 0 ? [...link.tags] : [...contact.tags],
      isActive: link.isActive && contact.isActive,
      endDate: link.endDate,
      hasOverrides: Boolean(link.phone || link.email || link.fax),
      sharedContact: this.toContactSummary(contact),
      linkedRecord
    };
  }

  private async toLinkedRecordSummary(link: ContactLinkRecord): Promise<LinkedRecordSummary> {
    if (link.linkedRecordKind === 'customer') {
      const customer = await this.getCustomerById(link.linkedRecordId);
      return {
        id: customer.id,
        kind: 'customer',
        name: customer.name,
        subtitle: formatCustomerSubtitle(customer)
      };
    }

    const location = await this.getLocationById(link.linkedRecordId);
    return {
      id: location.id,
      kind: 'location',
      name: location.name,
      subtitle: formatLocationSubtitle(location)
    };
  }

  private toContactSummary(contact: ContactRecord): ContactSummary {
    return {
      id: contact.id,
      displayName: contact.displayName,
      phone: contact.phone,
      email: contact.email,
      fax: contact.fax,
      tags: [...contact.tags],
      isActive: contact.isActive
    };
  }

  private toCustomerLocationListItem(location: LocationRecord): CustomerLocationListItem {
    return {
      id: location.id,
      name: location.name,
      addressLine1: location.addressLine1,
      city: location.city,
      state: location.state,
      postalCode: location.postalCode,
      isActive: location.isActive
    };
  }
}

function formatCustomerSubtitle(customer: CustomerAccountRecord): string {
  return `${customer.billingAddressLine1}, ${customer.billingCity}, ${customer.billingState} ${customer.billingPostalCode}`;
}

function formatLocationSubtitle(location: LocationRecord): string {
  return `${location.addressLine1}, ${location.city}, ${location.state} ${location.postalCode}`;
}
