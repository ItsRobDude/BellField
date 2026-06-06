import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import * as inventoryApi from '@/lib/operations-inventory-api';
import { JobCostResolutionPanel } from './job-cost-resolution-panel';

vi.mock('@/lib/operations-api', () => ({
  getOfficeRegisterEntries: vi.fn()
}));
vi.mock('@/lib/operations-inventory-api', () => ({
  getOfficeInventoryItems: vi.fn(),
  getOfficeInventoryLocations: vi.fn()
}));
vi.mock('@/lib/operations-job-costing-api', () => ({
  resolveOfficeRegisterCost: vi.fn()
}));

const mockedOps = vi.mocked(operationsApi);
const mockedInventory = vi.mocked(inventoryApi);

function arrange() {
  mockedOps.getOfficeRegisterEntries.mockResolvedValue({
    registerEntries: [
      {
        id: 'reg-1',
        jobId: 'job-1',
        kind: 'part',
        description: 'Capacitor',
        quantity: 1,
        totalAmount: 45,
        billingProjectionState: 'billable',
        costingStatus: 'needsResolution',
        capturedByEmployeeId: 'tech-1',
        capturedByName: 'Tia Tech',
        capturedAt: '2026-06-02T00:00:00.000Z',
        isVoid: false,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z'
      }
    ]
  } as never);
  mockedInventory.getOfficeInventoryItems.mockResolvedValue({
    items: [
      {
        id: 'part-1',
        name: 'Capacitor 45/5',
        sku: 'CAP-45',
        kind: 'part',
        isActive: true,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z'
      },
      {
        id: 'equip-1',
        name: 'Condenser Unit',
        sku: 'CON-1',
        kind: 'equipment',
        isActive: true,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z'
      }
    ]
  } as never);
  mockedInventory.getOfficeInventoryLocations.mockResolvedValue({
    locations: [
      {
        id: 'loc-1',
        name: 'Main Warehouse',
        kind: 'warehouse',
        isActive: true,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z'
      }
    ]
  } as never);
}

function renderPanel() {
  render(
    <JobCostResolutionPanel
      jobId="job-1"
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canEdit
      jobIsFinal={false}
      onResolved={vi.fn()}
    />
  );
}

beforeEach(() => {
  arrange();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('JobCostResolutionPanel', () => {
  it('excludes equipment from the tracked-inventory item picker (parts only)', async () => {
    renderPanel();

    fireEvent.click(await screen.findByRole('button', { name: 'Resolve cost' }));
    const itemSelect = await screen.findByRole('combobox', { name: 'Inventory item' });

    // Issuing from stock posts material cost, so only parts may be selected here.
    expect(within(itemSelect).queryByText('Capacitor 45/5 (CAP-45)')).not.toBeNull();
    expect(within(itemSelect).queryByText('Condenser Unit (CON-1)')).toBeNull();
  });
});
