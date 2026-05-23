import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CrmSearchResult,
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
  contacts: [],
  alternateBillToCustomerIds: [],
  ownershipHistory: []
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

  render(<CrmPanel apiBaseUrl="http://api.test" sessionToken="session-token" onErrorMessage={vi.fn()} />);
}

function fillRequiredLocationFields(input: { phone?: string; fax?: string }) {
  fireEvent.change(screen.getByPlaceholderText('Location name'), { target: { value: 'Main Shop' } });
  fireEvent.change(screen.getByPlaceholderText('Service address'), { target: { value: '123 Main' } });
  fireEvent.change(screen.getAllByPlaceholderText('City')[1], { target: { value: 'Blaine' } });
  fireEvent.change(screen.getAllByPlaceholderText('State')[1], { target: { value: 'WA' } });
  fireEvent.change(screen.getAllByPlaceholderText('Postal code')[1], { target: { value: '98230' } });

  if (input.phone) {
    fireEvent.change(screen.getAllByPlaceholderText('Phone')[1], { target: { value: input.phone } });
  }

  if (input.fax) {
    fireEvent.change(screen.getAllByPlaceholderText('Fax')[1], { target: { value: input.fax } });
  }
}

describe('CrmPanel', () => {
  it('requires confirmation for fax-only locations before creating', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _options?: RequestInit) => jsonResponse(workspace));
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Create location' });
    fillRequiredLocationFields({ fax: '360-555-0199' });

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));

    expect(screen.getByText('Location has no phone or email')).toBeInTheDocument();
    expect(screen.getByText('Fax will be saved, but phone and email are still missing.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, options]) => (options as RequestInit | undefined)?.method === 'POST')).toBe(
      false
    );
  });

  it('lets staff cancel or confirm duplicate location creation', async () => {
    const createResponse: LocationMutationResponse = { location: createdLocation };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = new URL(String(input));

      if (url.pathname === '/operations/crm' && !options?.method) {
        return jsonResponse(workspace);
      }

      if (url.pathname === '/operations/crm/search') {
        return jsonResponse({ query: url.searchParams.get('q') ?? '', results: [duplicateLocation] });
      }

      if (url.pathname === '/operations/crm/locations' && options?.method === 'POST') {
        return jsonResponse(createResponse);
      }

      return jsonResponse({});
    });
    renderCrmPanel(fetchMock);

    await screen.findByRole('heading', { name: 'Create location' });
    fillRequiredLocationFields({ phone: '360-555-0100' });

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));
    expect(await screen.findByText('Possible duplicate location')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByText('Possible duplicate location')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Create location' }));
    expect(await screen.findByText('Possible duplicate location')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create anyway' }));

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(([input, options]) => {
        const url = new URL(String(input));
        return url.pathname === '/operations/crm/locations' && (options as RequestInit | undefined)?.method === 'POST';
      });
      expect(createCall).toBeDefined();
      expect(JSON.parse(String((createCall?.[1] as RequestInit).body))).toMatchObject({
        confirmDuplicate: true,
        phone: '360-555-0100'
      });
    });
  });
});
