import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContactRecord, CustomerAccountRecord, LocationRecord } from './company-data.types';
import { ReferenceDataRepository } from './reference-data.repository';

@Injectable()
export class ReferenceDataService {
  constructor(private readonly referenceDataRepository: ReferenceDataRepository) {}

  async listCustomers(): Promise<CustomerAccountRecord[]> {
    return this.referenceDataRepository.listCustomers();
  }

  async listContacts(): Promise<ContactRecord[]> {
    return this.referenceDataRepository.listContacts();
  }

  async listLocations(): Promise<LocationRecord[]> {
    return this.referenceDataRepository.listLocations();
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
}
