import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContactRecord, CustomerAccountRecord, LocationRecord } from './company-data.types';
import { seededContacts, seededCustomers, seededLocations } from './seed-company-data';

@Injectable()
export class ReferenceDataService {
  private readonly customers = new Map<string, CustomerAccountRecord>(
    seededCustomers.map((customer) => [customer.id, structuredClone(customer)])
  );

  private readonly contacts = new Map<string, ContactRecord>(
    seededContacts.map((contact) => [contact.id, structuredClone(contact)])
  );

  private readonly locations = new Map<string, LocationRecord>(
    seededLocations.map((location) => [location.id, structuredClone(location)])
  );

  listCustomers(): CustomerAccountRecord[] {
    return [...this.customers.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  listContacts(): ContactRecord[] {
    return [...this.contacts.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  listLocations(): LocationRecord[] {
    return [...this.locations.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  getLocationById(locationId: string): LocationRecord {
    const location = this.locations.get(locationId);

    if (!location) {
      throw new NotFoundException('Location not found.');
    }

    return location;
  }

  getCustomerById(customerId: string): CustomerAccountRecord {
    const customer = this.customers.get(customerId);

    if (!customer) {
      throw new NotFoundException('Customer account not found.');
    }

    return customer;
  }

  getContactById(contactId: string): ContactRecord {
    const contact = this.contacts.get(contactId);

    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }

    return contact;
  }
}
