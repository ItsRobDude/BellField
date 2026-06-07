import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ContactDetail,
  ContactMethodMutationResponse,
  ContactMutationResponse,
  CrmOperationalContext,
  CrmSearchResult,
  CustomerDetail,
  CustomerMutationResponse,
  CrmWorkspaceResponse,
  LocationDetail,
  LocationMutationResponse
} from '@/lib/operations-api';
import { CrmPanel } from './crm-panel';

const workspace: CrmWorkspaceResponse = {
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
  contacts: [],
  locations: []
};

const workspaceWithContact: CrmWorkspaceResponse = {
  ...workspace,
  contacts: [
    {
      id: 'contact-1',
      displayName: 'Sam Service',
      phone: '360-555-0188',
      tags: [],
      isActive: true
    }
  ]
};

const duplicateLocation: CrmSearchResult = {
  id: 'location-existing',
  kind: 'location',
  title: 'Main Shop',
  subtitle: '123 Main, Blaine',
  badges: [],
  addressLine1: '123 Main',
  city: 'Blaine',
  state: 'WA',
  postalCode: '98230',
  customerId: 'customer-1',
  customerName: 'Acme',
  isActive: true
};

const customerResult: CrmSearchResult = {
  id: 'customer-1',
  kind: 'customer',
  title: 'Acme',
  subtitle: '123 Main, Blaine',
  badges: [],
  addressLine1: '123 Main',
  city: 'Blaine',
  state: 'WA',
  postalCode: '98230',
  isActive: true
};

const newOwnerResult: CrmSearchResult = {
  id: 'customer-2',
  kind: 'customer',
  title: 'North End Homes',
  subtitle: '12 Cedar Lane, Everett',
  badges: [],
  addressLine1: '12 Cedar Lane',
  city: 'Everett',
  state: 'WA',
  postalCode: '98201',
  isActive: true
};

const contactResult: CrmSearchResult = {
  id: 'contact-1',
  kind: 'contact',
  title: 'Sam Service',
  subtitle: '360-555-0188',
  badges: [],
  isActive: true
};

function emptyOperationalContext(): CrmOperationalContext {
  return {
    summary: {
      openJobCount: 0,
      equipmentCount: 0,
      appointmentCount: 0,
      invoiceCount: 0,
      estimateCount: 0
    },
    jobs: [],
    appointments: [],
    invoices: [],
    estimates: [],
    equipment: [],
    activity: []
  };
}

const customerDetail: CustomerDetail = {
  id: 'customer-1',
  name: 'Acme',
  accountType: 'company',
  billingAddressLine1: '123 Main',
  billingCity: 'Blaine',
  billingState: 'WA',
  billingPostalCode: '98230',
  phone: '360-555-0100',
  isActive: true,
  flags: [],
  contactMethods: [],
  contacts: [],
  locations: [],
  operational: emptyOperationalContext()
};

const newOwnerDetail: CustomerDetail = {
  id: 'customer-2',
  name: 'North End Homes',
  accountType: 'landlord',
  billingAddressLine1: '12 Cedar Lane',
  billingCity: 'Everett',
  billingState: 'WA',
  billingPostalCode: '98201',
  phone: '360-555-0190',
  isActive: true,
  flags: [],
  contactMethods: [],
  contacts: [],
  locations: [],
  operational: emptyOperationalContext()
};

const createdLocation: LocationDetail = {
  id: 'location-1',
  name: 'Main Shop',
  customerId: 'customer-1',
  customerName: 'Acme',
  addressLine1: '123 Main',
  city: 'Blaine',
  state: 'WA',
  postalCode: '98230',
  phone: '360-555-0100',
  isActive: true,
  contactMethods: [],
  contacts: [],
  alternateBillToCustomerIds: [],
  ownershipHistory: [],
  operational: emptyOperationalContext()
};

const transferredLocation: LocationDetail = {
  ...createdLocation,
  customerId: 'customer-2',
  customerName: 'North End Homes',
  ownershipHistory: [
    {
      id: 'history-1',
      customerId: 'customer-1',
      customerName: 'Acme',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: `${todayDateString()}T00:00:00.000Z`
    },
    {
      id: 'history-2',
      customerId: 'customer-2',
      customerName: 'North End Homes',
      startedAt: `${todayDateString()}T00:00:00.000Z`
    }
  ]
};

const createdContact: ContactDetail = {
  id: 'contact-1',
  displayName: 'Sam Service',
  phone: '360-555-0188',
  tags: [],
  isActive: true,
  contactMethods: [],
  linkedRecords: []
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function renderCrmPanel(
  fetchMock: ReturnType<typeof vi.fn>,
  props: Partial<Parameters<typeof CrmPanel>[0]> = {}
) {
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CrmPanel
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      onErrorMessage={vi.fn()}
      {...props}
    />
  );
}

async function openNewLocationForm() {
  await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
  fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
    target: { value: 'Acme' }
  });
  fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));
  expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'Add location' })[0]);
  await screen.findByRole('heading', { name: 'Create location' });
}

function fillRequiredLocationFields(input: { phone?: string; fax?: string }) {
  fireEvent.change(screen.getByPlaceholderText('Location name'), {
    target: { value: 'Main Shop' }
  });
  fireEvent.change(screen.getByPlaceholderText('Service address'), {
    target: { value: '123 Main' }
  });
  fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Blaine' } });
  fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: 'WA' } });
  fireEvent.change(screen.getByPlaceholderText('Postal code'), {
    target: { value: '98230' }
  });

  if (input.phone) {
    fireEvent.change(screen.getByPlaceholderText('Phone'), {
      target: { value: input.phone }
    });
  }

  if (input.fax) {
    fireEvent.change(screen.getByPlaceholderText('Fax'), { target: { value: input.fax } });
  }
}

describe('CrmPanel', () => {
  it('starts on a search-first CRM page with create actions hidden behind modes', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) =>
      jsonResponse(workspace)
    );
    renderCrmPanel(fetchMock);

    expect(
      await screen.findByRole('heading', { name: 'Find customers, locations, and people' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Customer, location, or person search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New customer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add phone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create customer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create location' })).not.toBeInTheDocument();
  });

  it('switches from search results to detail and back to search', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [customerResult]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));

    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add phone' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Customer, location, or person search')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Find customers, locations, and people' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Customer, location, or person search')).toBeInTheDocument();
  });

  it('opens location detail from the customer locations tab', async () => {
    const customerWithLocation: CustomerDetail = {
      ...customerDetail,
      locations: [
        {
          id: 'location-1',
          name: 'Main Shop',
          addressLine1: '123 Main',
          city: 'Blaine',
          state: 'WA',
          postalCode: '98230',
          isActive: true
        }
      ]
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [customerResult]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerWithLocation);
      }

      if (url.pathname === '/operations/crm/locations/location-1') {
        return jsonResponse(createdLocation);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));
    expect(await screen.findByRole('tab', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Contacts' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('tab', { name: 'Locations' }));
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));

    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByText('Main Shop')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Contacts' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open customer' }));

    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
  });

  it('loads an exact navigation target and can return to the source job', async () => {
    const onBackToJob = vi.fn();
    const onNavigationTargetConsumed = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/locations/location-1') {
        return jsonResponse(createdLocation);
      }

      return jsonResponse({});
    });

    renderCrmPanel(fetchMock, {
      navigationTarget: { kind: 'location', locationId: 'location-1', returnToJobId: 'job-1' },
      onNavigationTargetConsumed,
      onBackToJob
    });

    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    expect(await screen.findByText('Main Shop')).toBeInTheDocument();
    expect(onNavigationTargetConsumed).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(onBackToJob).toHaveBeenCalledWith('job-1');
  });

  it('shows customer service context across jobs, invoices, and activity tabs', async () => {
    const detailWithServiceContext: CustomerDetail = {
      ...customerDetail,
      operational: {
        ...emptyOperationalContext(),
        summary: {
          openJobCount: 1,
          lastServiceAt: '2026-06-01',
          equipmentCount: 2,
          appointmentCount: 1,
          invoiceCount: 1,
          estimateCount: 1
        },
        jobs: [
          {
            id: 'job-1',
            jobNumber: '1001',
            locationId: 'location-1',
            locationName: 'Main Shop',
            billToCustomerId: 'customer-1',
            billToCustomerName: 'Acme',
            jobType: 'Service',
            category: 'General',
            origin: 'Inbound phone call',
            summary: 'No cooling',
            status: 'scheduled',
            appointmentCount: 1,
            nextAppointment: {
              id: 'appointment-1',
              jobId: 'job-1',
              jobNumber: '1001',
              scheduledDate: '2026-06-03',
              scheduledStartTime: '13:00',
              scheduledEndTime: '15:00',
              technicianName: 'Taylor Tech',
              status: 'confirmed',
              createdAt: '2026-06-01T10:00:00.000Z',
              updatedAt: '2026-06-01T10:00:00.000Z'
            },
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-01T10:00:00.000Z'
          }
        ],
        appointments: [],
        invoices: [
          {
            id: 'invoice-1',
            jobId: 'job-1',
            jobNumber: '1001',
            invoiceKind: 'main',
            status: 'draft',
            total: 125,
            costComplete: true,
            createdAt: '2026-06-01T10:00:00.000Z',
            updatedAt: '2026-06-01T10:00:00.000Z'
          }
        ],
        estimates: [
          {
            id: 'estimate-1',
            jobId: 'job-1',
            jobNumber: '1001',
            status: 'pending',
            title: 'Replace capacitor',
            total: 225,
            costComplete: false,
            createdAt: '2026-06-01T10:00:00.000Z',
            updatedAt: '2026-06-01T10:00:00.000Z'
          }
        ],
        equipment: [],
        activity: [
          {
            id: 'contact-link-1',
            kind: 'contact',
            occurredAt: '2026-06-01T11:00:00.000Z',
            title: 'Contact linked: Casey Parker',
            detail: 'Primary phone',
            locationId: 'location-1',
            locationName: 'Main Shop'
          },
          {
            id: 'timeline-1',
            kind: 'job',
            occurredAt: '2026-06-01T10:00:00.000Z',
            title: 'Job scheduled.',
            detail: 'Job 1001',
            jobId: 'job-1',
            jobNumber: '1001',
            locationId: 'location-1',
            locationName: 'Main Shop',
            actorName: 'Olivia Owner'
          }
        ]
      }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({ query: url.searchParams.get('q') ?? '', results: [customerResult] });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(detailWithServiceContext);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));

    expect(await screen.findByText('Open jobs')).toBeInTheDocument();
    expect(screen.getByText('Last service')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText('No cooling')).toBeInTheDocument();
    expect(screen.getByText(/Taylor Tech/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Invoices' }));
    expect(screen.getByText('$125.00')).toBeInTheDocument();
    expect(screen.getByText('Replace capacitor')).toBeInTheDocument();
    expect(screen.getByText('Cost incomplete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Contact linked: Casey Parker')).toBeInTheDocument();
    expect(screen.getByText('Job scheduled.')).toBeInTheDocument();
  });

  it('shows location jobs and mixed activity while preserving ownership history', async () => {
    const locationWithServiceContext: LocationDetail = {
      ...createdLocation,
      ownershipHistory: [
        {
          id: 'history-1',
          customerId: 'customer-1',
          customerName: 'Acme',
          startedAt: '2026-01-01T00:00:00.000Z'
        }
      ],
      operational: {
        ...emptyOperationalContext(),
        summary: {
          openJobCount: 1,
          lastServiceAt: '2026-06-01',
          equipmentCount: 1,
          appointmentCount: 1,
          invoiceCount: 0,
          estimateCount: 0
        },
        jobs: [
          {
            id: 'job-1',
            jobNumber: '1001',
            locationId: 'location-1',
            locationName: 'Main Shop',
            billToCustomerId: 'customer-1',
            billToCustomerName: 'Acme',
            jobType: 'Service',
            category: 'General',
            origin: 'Inbound phone call',
            summary: 'No cooling',
            status: 'scheduled',
            appointmentCount: 1,
            nextAppointment: {
              id: 'appointment-1',
              jobId: 'job-1',
              jobNumber: '1001',
              scheduledDate: '2026-06-03',
              scheduledStartTime: '13:00',
              scheduledEndTime: '15:00',
              technicianName: 'Taylor Tech',
              status: 'confirmed',
              createdAt: '2026-06-01T10:00:00.000Z',
              updatedAt: '2026-06-01T10:00:00.000Z'
            },
            createdAt: '2026-06-01T09:00:00.000Z',
            updatedAt: '2026-06-01T10:00:00.000Z'
          }
        ],
        appointments: [],
        invoices: [],
        estimates: [],
        equipment: [
          {
            id: 'equipment-1',
            locationId: 'location-1',
            locationName: 'Main Shop',
            equipmentType: 'Condenser',
            brand: 'Carrier',
            model: 'ABC',
            serialNumber: 'SN1',
            status: 'active',
            updatedAt: '2026-06-01T10:00:00.000Z'
          }
        ],
        activity: [
          {
            id: 'history-1',
            kind: 'ownership',
            occurredAt: '2026-01-01T00:00:00.000Z',
            title: 'Owner: Acme',
            detail: 'Started 2026-01-01',
            locationId: 'location-1',
            locationName: 'Main Shop'
          },
          {
            id: 'contact-link-1',
            kind: 'contact',
            occurredAt: '2026-06-01T11:00:00.000Z',
            title: 'Contact linked: Casey Parker',
            detail: 'Primary phone',
            locationId: 'location-1',
            locationName: 'Main Shop'
          },
          {
            id: 'timeline-1',
            kind: 'job',
            occurredAt: '2026-06-01T10:00:00.000Z',
            title: 'Job scheduled.',
            detail: 'Job 1001',
            jobId: 'job-1',
            jobNumber: '1001',
            locationId: 'location-1',
            locationName: 'Main Shop'
          }
        ]
      }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [duplicateLocation]
        });
      }

      if (url.pathname === '/operations/crm/locations/location-existing') {
        return jsonResponse(locationWithServiceContext);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Main' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));

    expect(await screen.findByText('Current customer')).toBeInTheDocument();
    expect(screen.getByText('1 active / pending')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(screen.getByText('1001')).toBeInTheDocument();
    expect(screen.getByText(/Taylor Tech/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByText('Owner: Acme')).toBeInTheDocument();
    expect(screen.getByText('Contact linked: Casey Parker')).toBeInTheDocument();
    expect(screen.getByText('Job scheduled.')).toBeInTheDocument();
  });

  it('switches from search to a focused customer form and back', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) =>
      jsonResponse(workspace)
    );
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }));

    expect(await screen.findByRole('heading', { name: 'Create customer' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Customer, location, or person search')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Find customers, locations, and people' })
    ).toBeInTheDocument();
  });

  it('opens location creation from a selected customer and returns to that customer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({ query: url.searchParams.get('q') ?? '', results: [customerResult] });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await openNewLocationForm();
    expect(screen.queryByLabelText('Customer, location, or person search')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add location' }).length).toBeGreaterThan(0);
  });

  it('creates customers through the existing customer API', async () => {
    const createResponse: CustomerMutationResponse = { customer: customerDetail };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({ query: url.searchParams.get('q') ?? '', results: [] });
      }

      if (url.pathname === '/operations/crm/customers' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }));
    await screen.findByRole('heading', { name: 'Create customer' });
    fireEvent.change(screen.getByPlaceholderText('Customer name'), {
      target: { value: 'Acme' }
    });
    fireEvent.change(screen.getByPlaceholderText('Billing address'), {
      target: { value: '123 Main' }
    });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Blaine' } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: 'WA' } });
    fireEvent.change(screen.getByPlaceholderText('Postal code'), { target: { value: '98230' } });
    fireEvent.change(screen.getByPlaceholderText('Phone'), { target: { value: '360-555-0100' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/customers' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(createCall).toBeDefined();
      expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
        name: 'Acme',
        phone: '360-555-0100'
      });
    });
  });

  it('creates and links a contact from selected customer detail through existing APIs', async () => {
    const createResponse: ContactMutationResponse = { contact: createdContact };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [customerResult]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      if (url.pathname === '/operations/crm/contacts' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      if (url.pathname === '/operations/crm/contact-links' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));
    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New contact' }));
    expect(await screen.findByRole('heading', { name: 'New contact' })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Display name'), {
      target: { value: 'Sam Service' }
    });
    fireEvent.change(screen.getByPlaceholderText('Phone'), {
      target: { value: '360-555-0188' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create and link contact' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/contacts' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(createCall).toBeDefined();
      expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
        displayName: 'Sam Service',
        phone: '360-555-0188'
      });
    });

    await waitFor(() => {
      const linkCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/contact-links' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(linkCall).toBeDefined();
      expect(JSON.parse(String((linkCall?.[1] as RequestInit).body))).toMatchObject({
        contactId: 'contact-1',
        customerId: 'customer-1'
      });
    });
    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
  });

  it('links an existing contact through contextual search instead of a dropdown', async () => {
    const createResponse: ContactMutationResponse = { contact: createdContact };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspaceWithContact);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [customerResult]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      if (url.pathname === '/operations/crm/contact-links' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'People' }));

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Customer people existing person search'), {
      target: { value: 'Sam' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Sam Service/ }));
    expect(screen.getByText('Selected: Sam Service')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link existing person' }));

    await waitFor(() => {
      const linkCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/contact-links' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(linkCall).toBeDefined();
      expect(JSON.parse(String((linkCall?.[1] as RequestInit).body))).toMatchObject({
        contactId: 'contact-1',
        customerId: 'customer-1'
      });
    });
  });

  it('edits an existing contact method from customer detail', async () => {
    const customerDetailWithMethod: CustomerDetail = {
      ...customerDetail,
      contactMethods: [
        {
          id: 'contact-method-1',
          ownerKind: 'customer',
          ownerId: 'customer-1',
          kind: 'phone',
          label: 'Primary',
          value: '360-555-0100',
          isPrimary: true,
          isActive: true
        }
      ]
    };
    const updateResponse: ContactMethodMutationResponse = {
      contactMethod: {
        ...customerDetailWithMethod.contactMethods[0],
        label: 'After hours',
        value: '360-555-0199'
      }
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [customerResult]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetailWithMethod);
      }

      if (
        url.pathname === '/operations/crm/contact-methods/contact-method-1' &&
        options?.method === 'PATCH'
      ) {
        return jsonResponse(updateResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    fireEvent.change(await screen.findByLabelText('Customer, location, or person search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));
    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();

    fireEvent.change(screen.getAllByDisplayValue('Primary')[0], {
      target: { value: 'After hours' }
    });
    fireEvent.change(screen.getByDisplayValue('360-555-0100'), {
      target: { value: '360-555-0199' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save method' }));

    await waitFor(() => {
      const updateCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/contact-methods/contact-method-1' &&
          (options as RequestInit | undefined)?.method === 'PATCH'
        );
      });
      expect(updateCall).toBeDefined();
      expect(JSON.parse(String((updateCall?.[1] as RequestInit).body))).toEqual({
        label: 'After hours',
        value: '360-555-0199',
        isPrimary: true,
        isActive: true
      });
    });
  });

  it('requires confirmation for fax-only locations before creating', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({ query: url.searchParams.get('q') ?? '', results: [customerResult] });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await openNewLocationForm();
    fillRequiredLocationFields({ fax: '360-555-0199' });

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));

    expect(screen.getByText('Location has no phone or email')).toBeInTheDocument();
    expect(
      screen.getByText('Fax will be saved, but phone and email are still missing.')
    ).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, options]) => (options as RequestInit | undefined)?.method === 'POST'
      )
    ).toBe(false);
  });

  it('lets staff cancel or confirm duplicate location creation', async () => {
    const createResponse: LocationMutationResponse = { location: createdLocation };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        const query = url.searchParams.get('q') ?? '';
        return jsonResponse({
          query,
          results: query.toLowerCase().includes('acme') ? [customerResult] : [duplicateLocation]
        });
      }

      if (url.pathname === '/operations/crm/customers/customer-1') {
        return jsonResponse(customerDetail);
      }

      if (url.pathname === '/operations/crm/locations' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await openNewLocationForm();
    fillRequiredLocationFields({ phone: '360-555-0100' });

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));
    expect(await screen.findByText('Possible duplicate location')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() =>
      expect(screen.queryByText('Possible duplicate location')).not.toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));
    expect(await screen.findByText('Possible duplicate location')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create anyway' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/locations' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(createCall).toBeDefined();
      expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
        confirmDuplicate: true,
        phone: '360-555-0100'
      });
    });
  });

  it('loads equipment from the selected location detail instead of a global rail surface', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [duplicateLocation]
        });
      }

      if (url.pathname === '/operations/crm/locations/location-existing') {
        return jsonResponse(createdLocation);
      }

      if (url.pathname === '/operations/equipment') {
        return jsonResponse({
          locations: [
            {
              id: createdLocation.id,
              name: createdLocation.name,
              customerId: createdLocation.customerId,
              customerName: createdLocation.customerName,
              addressLine1: createdLocation.addressLine1,
              city: createdLocation.city,
              state: createdLocation.state,
              postalCode: createdLocation.postalCode,
              contactNames: []
            }
          ],
          suggestedEquipmentTypes: ['Condenser'],
          equipment: []
        });
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
      target: { value: 'Main Shop' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));
    fireEvent.click(await screen.findByRole('tab', { name: 'Equipment' }));

    expect(await screen.findByRole('region', { name: 'Location equipment' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Equipment for Main Shop' })
    ).toBeInTheDocument();
    expect(screen.getByText('No equipment on this location yet.')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inventory placement' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).pathname === '/operations/equipment'
      )
    ).toBe(true);
  });

  it('shows contact-method actions on locations before switching tabs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [duplicateLocation]
        });
      }

      if (url.pathname === '/operations/crm/locations/location-existing') {
        return jsonResponse(createdLocation);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
      target: { value: 'Main Shop' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));

    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add phone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reassign owner' })).not.toBeInTheDocument();
  });

  it('transfers location ownership through customer search with an effective date', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        const query = url.searchParams.get('q') ?? '';
        return jsonResponse({
          query,
          results: query.toLowerCase().includes('north') ? [newOwnerResult] : [duplicateLocation]
        });
      }

      if (url.pathname === '/operations/crm/locations/location-existing' && !options?.method) {
        return jsonResponse(createdLocation);
      }

      if (
        url.pathname === '/operations/crm/locations/location-1/reassign-owner' &&
        options?.method === 'POST'
      ) {
        return jsonResponse({ location: transferredLocation });
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
      target: { value: 'Main Shop' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));

    expect(await screen.findByRole('heading', { name: 'Location' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }));
    expect(screen.getByText('Current customer: Acme')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search customers'), {
      target: { value: 'North' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    fireEvent.click(await screen.findByRole('button', { name: /North End Homes/ }));
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Sold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm transfer' }));

    await waitFor(() => {
      const transferCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/locations/location-1/reassign-owner' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(transferCall).toBeDefined();
      expect(JSON.parse(String((transferCall?.[1] as RequestInit).body))).toEqual({
        customerId: 'customer-2',
        effectiveDate: todayDateString(),
        note: 'Sold'
      });
    });
    expect(await screen.findByText('Current customer')).toBeInTheDocument();
    expect(screen.getByText('North End Homes')).toBeInTheDocument();
  });

  it('creates and selects a new customer inside the transfer flow', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        const query = url.searchParams.get('q') ?? '';
        return jsonResponse({
          query,
          results: query.toLowerCase().includes('main') ? [duplicateLocation] : []
        });
      }

      if (url.pathname === '/operations/crm/locations/location-existing' && !options?.method) {
        return jsonResponse(createdLocation);
      }

      if (url.pathname === '/operations/crm/customers' && options?.method === 'POST') {
        return jsonResponse({ customer: newOwnerDetail });
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
      target: { value: 'Main Shop' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Main Shop/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Transfer ownership' }));
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }));

    fireEvent.change(screen.getByPlaceholderText('Customer name'), {
      target: { value: 'North End Homes' }
    });
    fireEvent.change(screen.getByPlaceholderText('Billing address'), {
      target: { value: '12 Cedar Lane' }
    });
    fireEvent.change(screen.getByPlaceholderText('City'), { target: { value: 'Everett' } });
    fireEvent.change(screen.getByPlaceholderText('State'), { target: { value: 'WA' } });
    fireEvent.change(screen.getByPlaceholderText('Postal code'), {
      target: { value: '98201' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create and select customer' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return (
          url.pathname === '/operations/crm/customers' &&
          (options as RequestInit | undefined)?.method === 'POST'
        );
      });
      expect(createCall).toBeDefined();
    });
    expect(
      await screen.findByText(
        `Main Shop will transfer from Acme to North End Homes effective ${todayDateString()}.`
      )
    ).toBeInTheDocument();
  });

  it('keeps standalone contact detail from exposing location or contact create actions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({
          query: url.searchParams.get('q') ?? '',
          results: [contactResult]
        });
      }

      if (url.pathname === '/operations/crm/contacts/contact-1') {
        return jsonResponse(createdContact);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and people' });
    fireEvent.change(screen.getByLabelText('Customer, location, or person search'), {
      target: { value: 'Sam' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Sam Service/ }));

    expect(await screen.findByRole('heading', { name: 'Contact' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New contact' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add phone' })).toBeInTheDocument();
  });
});

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
