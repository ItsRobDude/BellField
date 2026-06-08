import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ServiceAgreementsService } from './service-agreements.service';
import type { ServiceAgreementDto } from './service-agreements.types';

function createService() {
  const identityAccessService = {
    getAuthorizedEmployee: jest.fn().mockResolvedValue({
      id: 'office-1',
      displayName: 'Pat Office',
      effectivePermissions: ['agreements:view', 'agreements:create', 'agreements:edit'],
      sessionSurface: 'office-web'
    })
  };
  const referenceDataService = {
    getCustomerById: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Acme' }),
    getLocationById: jest
      .fn()
      .mockImplementation((id: string) =>
        Promise.resolve({ id, name: id, customerId: 'customer-1' })
      )
  };
  const equipmentDataService = {
    getEquipmentById: jest.fn().mockResolvedValue({
      id: 'equipment-1',
      locationId: 'location-1',
      equipmentType: 'Unit',
      brand: 'Generic',
      model: 'A1',
      serialNumber: '',
      status: 'active',
      notes: '',
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z'
    })
  };
  const serviceAgreementsRepository = {
    listAgreements: jest.fn().mockResolvedValue([]),
    getAgreementById: jest.fn(),
    createAgreement: jest.fn(),
    updateAgreement: jest.fn(),
    changeAgreementStatus: jest.fn(),
    getCatalogItemKind: jest.fn().mockResolvedValue('agreement'),
    estimateExists: jest.fn().mockResolvedValue(true),
    estimateLineExists: jest.fn().mockResolvedValue(true)
  };

  return {
    service: new ServiceAgreementsService(
      identityAccessService as never,
      referenceDataService as never,
      equipmentDataService as never,
      serviceAgreementsRepository as never
    ),
    identityAccessService,
    referenceDataService,
    equipmentDataService,
    serviceAgreementsRepository
  };
}

function agreement(overrides: Partial<ServiceAgreementDto> = {}): ServiceAgreementDto {
  return {
    id: 'agreement-1',
    agreementNumber: 'SA-1001',
    customerId: 'customer-1',
    customerName: 'Acme',
    name: 'Maintenance plan',
    status: 'draft',
    billingCadence: 'annual',
    createdByName: 'Pat Office',
    updatedByName: 'Pat Office',
    createdAt: '2026-06-08T00:00:00.000Z',
    updatedAt: '2026-06-08T00:00:00.000Z',
    coveredLocations: [
      {
        id: 'coverage-1',
        agreementId: 'agreement-1',
        locationId: 'location-1',
        locationName: 'Main',
        createdAt: '2026-06-08T00:00:00.000Z'
      }
    ],
    coveredEquipment: [],
    visitTemplates: [],
    ...overrides
  };
}

describe('ServiceAgreementsService.createAgreement', () => {
  it('creates an office-only agreement with normalized coverage and source validation', async () => {
    const { service, identityAccessService, serviceAgreementsRepository } = createService();
    serviceAgreementsRepository.createAgreement.mockResolvedValue(agreement());

    await service.createAgreement('token', {
      customerId: 'customer-1',
      name: ' Maintenance plan ',
      sourceCatalogItemId: 'catalog-1',
      billingCadence: 'annual',
      coveredLocationIds: ['location-1', 'location-1'],
      coveredEquipmentIds: ['equipment-1'],
      visitTemplates: [{ title: ' Annual visit ', frequency: 'annual' }]
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'agreements:create',
      ['office-web']
    );
    expect(serviceAgreementsRepository.createAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Maintenance plan',
        coveredLocationIds: ['location-1'],
        coveredEquipmentIds: ['equipment-1'],
        visitTemplates: [expect.objectContaining({ title: 'Annual visit' })]
      }),
      expect.objectContaining({ id: 'office-1', displayName: 'Pat Office' })
    );
  });

  it('rejects a covered location that belongs to another customer', async () => {
    const { service, referenceDataService, serviceAgreementsRepository } = createService();
    referenceDataService.getLocationById.mockResolvedValue({
      id: 'location-2',
      name: 'Other',
      customerId: 'other-customer'
    });

    await expect(
      service.createAgreement('token', {
        customerId: 'customer-1',
        name: 'Plan',
        coveredLocationIds: ['location-2']
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceAgreementsRepository.createAgreement).not.toHaveBeenCalled();
  });

  it('rejects equipment that is not assigned to a covered location', async () => {
    const { service, equipmentDataService, serviceAgreementsRepository } = createService();
    equipmentDataService.getEquipmentById.mockResolvedValue({
      id: 'equipment-2',
      locationId: 'other-location',
      equipmentType: 'Unit',
      brand: 'Generic',
      model: 'A1',
      serialNumber: '',
      status: 'active',
      notes: '',
      createdAt: '2026-06-08T00:00:00.000Z',
      updatedAt: '2026-06-08T00:00:00.000Z'
    });

    await expect(
      service.createAgreement('token', {
        customerId: 'customer-1',
        name: 'Plan',
        coveredLocationIds: ['location-1'],
        coveredEquipmentIds: ['equipment-2']
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceAgreementsRepository.createAgreement).not.toHaveBeenCalled();
  });

  it('rejects a non-agreement source Catalog item', async () => {
    const { service, serviceAgreementsRepository } = createService();
    serviceAgreementsRepository.getCatalogItemKind.mockResolvedValue('service');

    await expect(
      service.createAgreement('token', {
        customerId: 'customer-1',
        name: 'Plan',
        sourceCatalogItemId: 'catalog-1',
        coveredLocationIds: ['location-1']
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown estimate line source', async () => {
    const { service, serviceAgreementsRepository } = createService();
    serviceAgreementsRepository.estimateLineExists.mockResolvedValue(false);

    await expect(
      service.createAgreement('token', {
        customerId: 'customer-1',
        name: 'Plan',
        sourceEstimateId: 'estimate-1',
        sourceEstimateLineItemId: 'line-missing',
        coveredLocationIds: ['location-1']
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ServiceAgreementsService status changes', () => {
  it('activates a draft agreement through agreements:edit', async () => {
    const { service, identityAccessService, serviceAgreementsRepository } = createService();
    serviceAgreementsRepository.getAgreementById
      .mockResolvedValueOnce(agreement({ status: 'draft' }))
      .mockResolvedValueOnce(agreement({ status: 'active' }));
    serviceAgreementsRepository.changeAgreementStatus.mockResolvedValue(true);

    const result = await service.activateAgreement('token', 'agreement-1', {
      occurredAt: '2026-06-08T12:00:00.000Z',
      reason: 'Sold'
    });

    expect(identityAccessService.getAuthorizedEmployee).toHaveBeenCalledWith(
      'token',
      'agreements:edit',
      ['office-web']
    );
    expect(serviceAgreementsRepository.changeAgreementStatus).toHaveBeenCalledWith(
      'agreement-1',
      'active',
      ['draft', 'paused'],
      '2026-06-08T12:00:00.000Z',
      'Sold',
      expect.objectContaining({ id: 'office-1' })
    );
    expect(result.agreement.status).toBe('active');
  });

  it('rejects a pause request for a draft agreement', async () => {
    const { service, serviceAgreementsRepository } = createService();
    serviceAgreementsRepository.getAgreementById.mockResolvedValue(agreement({ status: 'draft' }));

    await expect(service.pauseAgreement('token', 'agreement-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});
