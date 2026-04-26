import { ConflictException } from '@nestjs/common';
import { CrmService } from './crm.service';

function createService() {
  const referenceDataService = {
    listCustomers: jest.fn().mockResolvedValue([
      {
        id: 'customer-1',
        name: 'Acme Heating',
        accountType: 'company',
        billingAddressLine1: '100 Main Street',
        billingCity: 'Seattle',
        billingState: 'WA',
        billingPostalCode: '98101',
        phone: '(555) 111-2222',
        email: 'office@acme.local',
        fax: undefined,
        isActive: true,
        flags: []
      }
    ]),
    listLocations: jest.fn().mockResolvedValue([
      {
        id: 'location-1',
        name: 'Acme Shop',
        customerId: 'customer-1',
        addressLine1: '100 Main Street',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        phone: '(555) 111-2222',
        email: 'dispatch@acme.local',
        fax: undefined,
        isActive: true,
        alternateBillToCustomerIds: []
      }
    ]),
    listContacts: jest.fn().mockResolvedValue([]),
    createCustomer: jest.fn(),
    getCustomerById: jest.fn().mockResolvedValue({
      id: 'customer-1',
      name: 'Acme Heating',
      accountType: 'company',
      billingAddressLine1: '100 Main Street',
      billingCity: 'Seattle',
      billingState: 'WA',
      billingPostalCode: '98101',
      phone: '(555) 111-2222',
      email: 'office@acme.local',
      fax: undefined,
      isActive: true,
      flags: []
    })
  };

  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'employee-1',
      displayName: 'CSR',
      effectivePermissions: ['customers:create', 'contacts:edit', 'locations:create'],
      sessionSurface: 'office-web'
    })
  };

  return {
    service: new CrmService(referenceDataService as never, identityAccessService as never),
    referenceDataService
  };
}

describe('CrmService', () => {
  it('blocks duplicate customer creation until confirmed', async () => {
    const { service, referenceDataService } = createService();

    await expect(
      service.createCustomer('session-token', {
        name: 'Acme Heating',
        accountType: 'company',
        billingAddressLine1: '100 Main Street',
        billingCity: 'Seattle',
        billingState: 'WA',
        billingPostalCode: '98101',
        phone: '(555) 111-2222'
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(referenceDataService.createCustomer).not.toHaveBeenCalled();
  });

  it('requires at least one customer contact method', async () => {
    const { service, referenceDataService } = createService();

    await expect(
      service.createCustomer('session-token', {
        name: 'North End Homes',
        accountType: 'landlord',
        billingAddressLine1: '12 Cedar Lane',
        billingCity: 'Everett',
        billingState: 'WA',
        billingPostalCode: '98201'
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(referenceDataService.createCustomer).not.toHaveBeenCalled();
  });

  it('rejects local-only contact edits that try to rename the shared contact', async () => {
    const { service } = createService();

    await expect(
      service.updateContact('session-token', 'contact-1', {
        scope: 'link',
        linkId: 'link-1',
        displayName: 'New Name',
        phone: '(555) 222-3333'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
