import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as operationsApi from '@/lib/operations-api';
import { OfficeInventorySurface } from './office-workspace-inventory-surface';

vi.mock('@/lib/operations-api', () => ({
  getOfficeInventoryOnHand: vi.fn(),
  getOfficeInventoryItems: vi.fn(),
  getOfficeInventoryLocations: vi.fn(),
  getOfficeInventoryMovements: vi.fn(),
  getOfficeJobsWorkspace: vi.fn(),
  createOfficeInventoryItem: vi.fn(),
  updateOfficeInventoryItem: vi.fn(),
  createOfficeInventoryLocation: vi.fn(),
  updateOfficeInventoryLocation: vi.fn(),
  createOfficeInventoryAdjustment: vi.fn(),
  createOfficeInventoryTransfer: vi.fn(),
  issueOfficeInventoryToJob: vi.fn()
}));

const mockedApi = vi.mocked(operationsApi);

function arrange() {
  mockedApi.getOfficeInventoryOnHand.mockResolvedValue({ rows: [] });
  mockedApi.getOfficeInventoryItems.mockResolvedValue({
    items: [
      {
        id: 'item-1',
        name: 'Capacitor 45/5',
        kind: 'part',
        isActive: true,
        createdAt: '2026-06-02T00:00:00.000Z',
        updatedAt: '2026-06-02T00:00:00.000Z'
      }
    ]
  });
  mockedApi.getOfficeInventoryLocations.mockResolvedValue({
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
  });
  mockedApi.getOfficeInventoryMovements.mockResolvedValue({ movements: [] });
  mockedApi.getOfficeJobsWorkspace.mockResolvedValue({
    customers: [],
    locations: [],
    technicians: [],
    jobs: [{ id: 'job-1', jobNumber: '1001', summary: 'No cooling' }]
  } as never);
}

function renderSurface(overrides: { canCreate?: boolean; canEdit?: boolean } = {}) {
  render(
    <OfficeInventorySurface
      apiBaseUrl="http://api.test"
      sessionToken="session-token"
      canCreate={overrides.canCreate ?? true}
      canEdit={overrides.canEdit ?? true}
      onOpenJob={vi.fn()}
    />
  );
}

beforeEach(() => {
  arrange();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OfficeInventorySurface', () => {
  it('hides write actions without create/edit permission', async () => {
    renderSurface({ canCreate: false, canEdit: false });
    await screen.findByText('On hand');
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Adjust stock' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Issue to job' })).toBeNull();
  });

  it('locks the other action triggers while a form is open', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Add item' }));
    // Opening the item form disables the other action triggers (single active form).
    expect(screen.getByRole('button', { name: 'Adjust stock' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add location' })).toBeDisabled();
  });

  it('keeps Save disabled on the issue form until a job and quantity are entered', async () => {
    renderSurface();
    fireEvent.click(await screen.findByRole('button', { name: 'Issue to job' }));

    const saveButton = await screen.findByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();

    // The job picker loads on demand; choose a job and enter a quantity, then Save enables.
    const jobSelect = await screen.findByRole('combobox', { name: 'Job' });
    await waitFor(() => expect(within(jobSelect).queryByText('#1001 · No cooling')).not.toBeNull());
    fireEvent.change(jobSelect, { target: { value: 'job-1' } });
    expect(saveButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Quantity' }), {
      target: { value: '2' }
    });
    expect(saveButton).not.toBeDisabled();
  });
});
