import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ContactMutationResponse,
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
  locations: []
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
  ownershipHistory: []
};

const createdContact = {
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

function renderCrmPanel(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CrmPanel apiBaseUrl="http://api.test" sessionToken="session-token" onErrorMessage={vi.fn()} />
  );
}

async function openNewLocationForm() {
  await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' });
  fireEvent.change(screen.getByLabelText('Customer, location, or contact search'), {
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
      await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Customer, location, or contact search')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New customer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New location' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New contact' })).not.toBeInTheDocument();
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

    fireEvent.change(await screen.findByLabelText('Customer, location, or contact search'), {
      target: { value: 'Acme' }
    });
    fireEvent.click(await screen.findByRole('button', { name: /Acme/ }));

    expect(await screen.findByRole('heading', { name: 'Customer' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Customer, location, or contact search')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Customer, location, or contact search')).toBeInTheDocument();
  });

  it('switches from search to a focused customer form and back', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) =>
      jsonResponse(workspace)
    );
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' });
    fireEvent.click(screen.getByRole('button', { name: 'New customer' }));

    expect(await screen.findByRole('heading', { name: 'Create customer' })).toBeInTheDocument();
    expect(
      screen.queryByLabelText('Customer, location, or contact search')
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' })
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
    expect(
      screen.queryByLabelText('Customer, location, or contact search')
    ).not.toBeInTheDocument();

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

    await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' });
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

    fireEvent.change(await screen.findByLabelText('Customer, location, or contact search'), {
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

    await screen.findByRole('heading', { name: 'Find customers, locations, and contacts' });
    fireEvent.change(screen.getByLabelText('Customer, location, or contact search'), {
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
});
