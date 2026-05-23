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
    searchCrm: jest.fn().mockResolvedValue([
      {
        id: 'customer-1',
        kind: 'customer',
        title: 'Acme Heating',
        subtitle: '100 Main Street, Seattle, WA 98101',
        badges: [],
        phone: '(555) 111-2222',
        addressLine1: '100 Main Street',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        isActive: true,
        score: 100
      }
    ]),
    findCustomerDuplicateCandidates: jest.fn().mockResolvedValue([]),
    findLocationDuplicateCandidates: jest.fn().mockResolvedValue([]),
    createCustomer: jest.fn().mockResolvedValue({
      id: 'customer-2',
      name: 'North End Homes',
      accountType: 'landlord',
      billingAddressLine1: '12 Cedar Lane',
      billingCity: 'Everett',
      billingState: 'WA',
      billingPostalCode: '98201',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      flags: []
    }),
    createLocation: jest.fn().mockResolvedValue({
      id: 'location-2',
      name: 'North End Rental',
      customerId: 'customer-1',
      addressLine1: '12 Cedar Lane',
      city: 'Everett',
      state: 'WA',
      postalCode: '98201',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      alternateBillToCustomerIds: []
    }),
    updateLocation: jest.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Acme Shop',
      customerId: 'customer-1',
      addressLine1: '100 Main Street',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      alternateBillToCustomerIds: []
    }),
    createContact: jest.fn().mockResolvedValue({
      id: 'contact-1',
      displayName: 'Site Contact',
      phone: undefined,
      email: undefined,
      fax: undefined,
      tags: [],
      isActive: true
    }),
    updateContact: jest.fn().mockResolvedValue({
      id: 'contact-1',
      displayName: 'Site Contact',
      phone: undefined,
      email: undefined,
      fax: undefined,
      tags: [],
      isActive: true
    }),
    getLocationById: jest.fn().mockResolvedValue({
      id: 'location-1',
      name: 'Acme Shop',
      customerId: 'customer-1',
      addressLine1: '100 Main Street',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
      phone: undefined,
      email: undefined,
      fax: undefined,
      isActive: true,
      alternateBillToCustomerIds: []
    }),
    getContactById: jest.fn().mockResolvedValue({
      id: 'contact-1',
      displayName: 'Site Contact',
      phone: undefined,
      email: undefined,
      fax: undefined,
      tags: [],
      isActive: true
    }),
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
    referenceDataService,
    identityAccessService
  };
}

describe('CrmService', () => {
  it('uses bounded SQL-backed CRM search instead of hydrating every CRM row', async () => {
    const { service, referenceDataService, identityAccessService } = createService();

    const response = await service.search('session-token', ' Acme ');

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith('session-token', 'customers:view', [
      'office-web'
    ]);
    expect(referenceDataService.searchCrm).toHaveBeenCalledWith('Acme', 25);
    expect(referenceDataService.listCustomers).not.toHaveBeenCalled();
    expect(referenceDataService.listLocations).not.toHaveBeenCalled();
    expect(referenceDataService.listContacts).not.toHaveBeenCalled();
    expect(response).toEqual({
      query: ' Acme ',
      results: [
        {
          id: 'customer-1',
          kind: 'customer',
          title: 'Acme Heating',
          subtitle: '100 Main Street, Seattle, WA 98101',
          badges: [],
          phone: '(555) 111-2222',
          addressLine1: '100 Main Street',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          isActive: true
        }
      ]
    });
  });

  it('does not run CRM search for blank queries', async () => {
    const { service, referenceDataService } = createService();

    await expect(service.search('session-token', '   ')).resolves.toEqual({ query: '   ', results: [] });

    expect(referenceDataService.searchCrm).not.toHaveBeenCalled();
  });

  it('blocks duplicate customer creation until confirmed', async () => {
    const { service, referenceDataService } = createService();
    referenceDataService.findCustomerDuplicateCandidates.mockResolvedValueOnce([
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
    ]);

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

    expect(referenceDataService.findCustomerDuplicateCandidates).toHaveBeenCalledWith({
      normalizedName: 'acmeheating',
      normalizedPhone: '5551112222',
      normalizedAddress: '100mainstreetseattlewa98101',
      excludedCustomerId: undefined,
      limit: 25
    });
    expect(referenceDataService.listCustomers).not.toHaveBeenCalled();
    expect(referenceDataService.createCustomer).not.toHaveBeenCalled();
  });

  it('blocks duplicate location creation through targeted candidate lookup', async () => {
    const { service, referenceDataService } = createService();
    referenceDataService.findLocationDuplicateCandidates.mockResolvedValueOnce([
      {
        id: 'location-1',
        name: 'Acme Shop',
        customerId: 'customer-1',
        customerName: 'Acme Heating',
        customerFlags: ['Do not service'],
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
    ]);

    await expect(
      service.createLocation('session-token', {
        customerId: 'customer-1',
        name: 'Acme Shop',
        addressLine1: '100 Main Street',
        city: 'Seattle',
        state: 'WA',
        postalCode: '98101',
        phone: '(555) 111-2222'
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(referenceDataService.findLocationDuplicateCandidates).toHaveBeenCalledWith({
      normalizedName: 'acmeshop',
      normalizedPhone: '5551112222',
      normalizedAddress: '100mainstreetseattlewa98101',
      excludedLocationId: undefined,
      limit: 25
    });
    expect(referenceDataService.listLocations).not.toHaveBeenCalled();
    expect(referenceDataService.getCustomerById).toHaveBeenCalledTimes(1);
    expect(referenceDataService.createLocation).not.toHaveBeenCalled();
  });

  it('allows customer creation without a contact method', async () => {
    const { service, referenceDataService } = createService();

    await service.createCustomer('session-token', {
        name: 'North End Homes',
        accountType: 'landlord',
        billingAddressLine1: '12 Cedar Lane',
        billingCity: 'Everett',
        billingState: 'WA',
        billingPostalCode: '98201'
      });

    expect(referenceDataService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: undefined,
        email: undefined,
        fax: undefined
      })
    );
  });

  it('requires confirmation before creating a fax-only location', async () => {
    const { service, referenceDataService } = createService();

    await expect(
      service.createLocation('session-token', {
        customerId: 'customer-1',
        name: 'North End Rental',
        addressLine1: '12 Cedar Lane',
        city: 'Everett',
        state: 'WA',
        postalCode: '98201',
        fax: '(555) 333-4444'
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(referenceDataService.createLocation).not.toHaveBeenCalled();
  });

  it('allows confirmed location creation without phone or email', async () => {
    const { service, referenceDataService } = createService();

    await service.createLocation('session-token', {
      customerId: 'customer-1',
      name: 'North End Rental',
      addressLine1: '12 Cedar Lane',
      city: 'Everett',
      state: 'WA',
      postalCode: '98201',
      confirmMissingContactInfo: true
    });

    expect(referenceDataService.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: undefined,
        email: undefined,
        fax: undefined
      })
    );
  });

  it('allows confirmed fax-only location creation without treating fax as phone or email', async () => {
    const { service, referenceDataService } = createService();

    await service.createLocation('session-token', {
      customerId: 'customer-1',
      name: 'North End Rental',
      addressLine1: '12 Cedar Lane',
      city: 'Everett',
      state: 'WA',
      postalCode: '98201',
      fax: '(555) 333-4444',
      confirmMissingContactInfo: true
    });

    expect(referenceDataService.createLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: undefined,
        email: undefined,
        fax: '(555) 333-4444'
      })
    );
  });

  it('requires confirmation before updating a location to have no phone or email', async () => {
    const { service, referenceDataService } = createService();

    await expect(
      service.updateLocation('session-token', 'location-1', {
        phone: '',
        email: '',
        fax: '(555) 333-4444',
        confirmDuplicate: true
      })
    ).rejects.toBeInstanceOf(ConflictException);

    expect(referenceDataService.updateLocation).not.toHaveBeenCalled();
  });

  it('allows contact creation without a contact method', async () => {
    const { service, referenceDataService } = createService();

    await service.createContact('session-token', {
      displayName: 'Site Contact'
    });

    expect(referenceDataService.createContact).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: undefined,
        email: undefined,
        fax: undefined
      })
    );
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
