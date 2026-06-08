import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import { OfficeAgreementsSurface } from './office-workspace-agreements-surface';

vi.mock('@/lib/operations-api', () => ({
  activateOfficeServiceAgreement: vi.fn(),
  createOfficeServiceAgreement: vi.fn(),
  endOfficeServiceAgreement: vi.fn(),
  getOfficeEquipmentWorkspace: vi.fn(),
  getOfficeJobsWorkspace: vi.fn(),
  listOfficeServiceAgreements: vi.fn(),
  pauseOfficeServiceAgreement: vi.fn(),
  updateOfficeServiceAgreement: vi.fn()
}));

const mockedApi = vi.mocked(operationsApi);

const agreement = {
  id: 'agreement-1',
  agreementNumber: 'SA-1001',
  customerId: 'customer-1',
  customerName: 'Acme',
  name: 'Annual maintenance',
  status: 'draft' as const,
  billingCadence: 'annual' as const,
  billingAmount: 240,
  createdByName: 'Office User',
  updatedByName: 'Office User',
  createdAt: '2026-06-08T00:00:00.000Z',
  updatedAt: '2026-06-08T00:00:00.000Z',
  coveredLocations: [
    {
      id: 'coverage-1',
      agreementId: 'agreement-1',
      locationId: 'location-1',
      locationName: 'Main Shop',
      createdAt: '2026-06-08T00:00:00.000Z'
    }
  ],
  coveredEquipment: [],
  visitTemplates: []
};

function arrange() {
  mockedApi.listOfficeServiceAgreements.mockResolvedValue({ agreements: [agreement] });
  mockedApi.getOfficeJobsWorkspace.mockResolvedValue({
    customers: [
      {
        id: 'customer-1',
        name: 'Acme',
        accountType: 'company',
        billingAddressLine1: '123 Main',
        billingCity: 'Blaine',
        billingState: 'WA',
        billingPostalCode: '98230',
        isActive: true,
        flags: []
      }
    ],
    locations: [
      {
        id: 'location-1',
        name: 'Main Shop',
        customerId: 'customer-1',
        customerName: 'Acme',
        addressLine1: '123 Main',
        city: 'Blaine',
        state: 'WA',
        postalCode: '98230',
        isActive: true,
        contacts: [],
        alternateBillToCustomerIds: []
      }
    ],
    technicians: [],
    jobs: []
  });
  mockedApi.getOfficeEquipmentWorkspace.mockResolvedValue({
    locations: [],
    suggestedEquipmentTypes: [],
    equipment: [
      {
        id: 'equipment-1',
        locationId: 'location-1',
        locationName: 'Main Shop',
        customerName: 'Acme',
        equipmentType: 'Water Heater',
        brand: 'Generic',
        model: 'WH-50',
        serialNumber: 'SN1',
        filterSizes: [],
        status: 'active',
        notes: '',
        updatedAt: '2026-06-08T00:00:00.000Z'
      }
    ]
  });
  mockedApi.createOfficeServiceAgreement.mockResolvedValue({
    agreement: { ...agreement, id: 'new-1' }
  });
  mockedApi.activateOfficeServiceAgreement.mockResolvedValue({
    agreement: { ...agreement, status: 'active' }
  });
}

function renderSurface(overrides: { canCreate?: boolean; canEdit?: boolean } = {}) {
  render(
    <OfficeAgreementsSurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canCreate={overrides.canCreate ?? true}
      canEdit={overrides.canEdit ?? true}
    />
  );
}

beforeEach(() => {
  arrange();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeAgreementsSurface', () => {
  it('hides write actions without create/edit permission', async () => {
    renderSurface({ canCreate: false, canEdit: false });
    await screen.findByText('Annual maintenance');

    expect(screen.queryByRole('button', { name: 'New agreement' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Activate' })).toBeNull();
  });

  it('creates an agreement with covered location and equipment selections', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'New agreement' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Priority plan' }
    });
    fireEvent.click(screen.getByLabelText(/Main Shop/));
    fireEvent.click(screen.getByLabelText(/Water Heater/));
    fireEvent.click(screen.getByRole('button', { name: 'Add visit template' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Annual inspection' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedApi.createOfficeServiceAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'Priority plan',
            coveredLocationIds: ['location-1'],
            coveredEquipmentIds: ['equipment-1'],
            visitTemplates: [expect.objectContaining({ title: 'Annual inspection' })]
          })
        })
      )
    );
  });

  it('activates a draft agreement from the detail panel', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Activate' }));

    await waitFor(() =>
      expect(mockedApi.activateOfficeServiceAgreement).toHaveBeenCalledWith(
        expect.objectContaining({ agreementId: 'agreement-1' })
      )
    );
  });
});
