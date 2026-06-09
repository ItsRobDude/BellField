import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import { OfficeAgreementsSurface } from './office-workspace-agreements-surface';

vi.mock('@/lib/operations-api', () => ({
  activateOfficeServiceAgreement: vi.fn(),
  createOfficeServiceAgreement: vi.fn(),
  endOfficeServiceAgreement: vi.fn(),
  getOfficeServiceAgreementReferenceData: vi.fn(),
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
  mockedApi.getOfficeServiceAgreementReferenceData.mockResolvedValue({
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
  mockedApi.updateOfficeServiceAgreement.mockResolvedValue({
    agreement: { ...agreement, name: 'Updated maintenance' }
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
    expect(mockedApi.getOfficeServiceAgreementReferenceData).not.toHaveBeenCalled();
  });

  it('creates an agreement with covered location and equipment selections', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'New agreement' }));
    await waitFor(() =>
      expect(mockedApi.getOfficeServiceAgreementReferenceData).toHaveBeenCalledWith({
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token',
        agreementId: undefined
      })
    );
    fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
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

  it('loads edit reference data for the selected agreement before opening the form', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    await waitFor(() =>
      expect(mockedApi.getOfficeServiceAgreementReferenceData).toHaveBeenCalledWith({
        apiBaseUrl: 'http://api.test',
        sessionToken: 'session-token',
        agreementId: 'agreement-1'
      })
    );
    expect(await screen.findByRole('textbox', { name: 'Name' })).toHaveValue('Annual maintenance');
  });

  it('updates an agreement without sending create-only customer fields', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    const nameInput = await screen.findByRole('textbox', { name: 'Name' });

    fireEvent.change(nameInput, { target: { value: 'Updated maintenance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedApi.updateOfficeServiceAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          agreementId: 'agreement-1',
          body: expect.objectContaining({ name: 'Updated maintenance' })
        })
      )
    );
    expect(mockedApi.updateOfficeServiceAgreement.mock.calls[0]?.[0].body).not.toHaveProperty(
      'customerId'
    );
  });

  it('sends nulls when cleared optional agreement fields should be removed', async () => {
    mockedApi.listOfficeServiceAgreements.mockResolvedValue({
      agreements: [
        {
          ...agreement,
          description: 'Existing description',
          renewalDate: '2026-07-01',
          nextBillingDate: '2026-08-01',
          billingAmount: 240
        }
      ]
    });
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));

    fireEvent.change(await screen.findByLabelText('Description'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Renewal'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Next billing'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Billing amount'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mockedApi.updateOfficeServiceAgreement).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            description: null,
            renewalDate: null,
            nextBillingDate: null,
            billingAmount: null
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
