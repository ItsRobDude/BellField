import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EquipmentDetail, EquipmentSummary, LocationSummary } from '@/lib/operations-api';
import { EquipmentPanel } from './equipment-panel';

const location: LocationSummary = {
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
};

const equipmentRecord: EquipmentSummary = {
  id: 'equipment-1',
  locationId: 'location-1',
  locationName: 'Main Shop',
  customerName: 'Acme',
  equipmentType: 'Condenser',
  brand: 'Carrier',
  model: '24ABC6',
  serialNumber: 'ABC123',
  filterSizes: ['16x25x1', '20x20x1'],
  equipmentLocationDescription: 'Back pad',
  installDate: '2020-08-14',
  status: 'active',
  notes: '',
  updatedAt: '2026-04-14T10:00:00.000Z'
};

const equipmentDetail: EquipmentDetail = {
  ...equipmentRecord,
  history: []
};

describe('EquipmentPanel', () => {
  it('renders warranty-relevant equipment glance fields with installed date as MM/DD/YYYY', () => {
    render(
      <EquipmentPanel
        locations={[location]}
        equipment={[equipmentRecord]}
        suggestedEquipmentTypes={['Condenser']}
        selectedEquipmentId="equipment-1"
        selectedEquipmentDetail={equipmentDetail}
        showInactiveEquipment={false}
        canReplaceRemove={false}
        canDelete={false}
        onSelectEquipment={vi.fn(async () => undefined)}
        onShowInactiveChange={vi.fn()}
        onCreateEquipment={vi.fn(async () => undefined)}
        onRecordUpdate={vi.fn(async () => undefined)}
        onLinkReplacement={vi.fn(async () => undefined)}
        onDeleteEquipment={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByRole('heading', { name: 'Equipment at a glance' })).toBeInTheDocument();
    expect(screen.getAllByText('Condenser').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Carrier').length).toBeGreaterThan(0);
    expect(screen.getAllByText('24ABC6').length).toBeGreaterThan(0);
    expect(screen.getByText('ABC123')).toBeInTheDocument();
    expect(screen.getByText('16x25x1, 20x20x1')).toBeInTheDocument();
    expect(screen.getByText('08/14/2020')).toBeInTheDocument();
    expect(screen.queryByText('4 years old')).not.toBeInTheDocument();
  });

  it('locks create placement to the selected location when location scoped', () => {
    const onCreateEquipment = vi.fn(async () => undefined);

    render(
      <EquipmentPanel
        locations={[location]}
        equipment={[]}
        suggestedEquipmentTypes={['Condenser']}
        locationScope={{ locationId: location.id, locationName: location.name }}
        selectedEquipmentDetail={null}
        showInactiveEquipment={false}
        canReplaceRemove={false}
        canDelete={false}
        onSelectEquipment={vi.fn(async () => undefined)}
        onShowInactiveChange={vi.fn()}
        onCreateEquipment={onCreateEquipment}
        onRecordUpdate={vi.fn(async () => undefined)}
        onLinkReplacement={vi.fn(async () => undefined)}
        onDeleteEquipment={vi.fn(async () => undefined)}
      />
    );

    expect(screen.getByRole('heading', { name: 'Equipment for Main Shop' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Inventory placement' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add equipment' }));

    expect(onCreateEquipment).toHaveBeenCalledWith(
      expect.objectContaining({
        placementKind: 'location',
        locationId: location.id,
        inventoryLocationLabel: ''
      })
    );
  });

  it('only offers pending-install equipment after the replacement action is opened', () => {
    const onLinkReplacement = vi.fn(async () => undefined);
    const activeFurnace: EquipmentSummary = {
      ...equipmentRecord,
      id: 'equipment-furnace',
      equipmentType: 'Gas Furnace',
      model: '58SB0A',
      serialNumber: 'FURNACE-1',
      status: 'active'
    };
    const pendingReplacement: EquipmentSummary = {
      ...equipmentRecord,
      id: 'equipment-pending',
      equipmentType: 'Heat Pump',
      brand: 'Trane',
      model: 'XR16',
      serialNumber: 'PENDING-1',
      status: 'pendingInstall'
    };

    render(
      <EquipmentPanel
        locations={[location]}
        equipment={[equipmentRecord, activeFurnace, pendingReplacement]}
        suggestedEquipmentTypes={['Condenser']}
        selectedEquipmentId="equipment-1"
        selectedEquipmentDetail={equipmentDetail}
        showInactiveEquipment={false}
        canReplaceRemove
        canDelete={false}
        onSelectEquipment={vi.fn(async () => undefined)}
        onShowInactiveChange={vi.fn()}
        onCreateEquipment={vi.fn(async () => undefined)}
        onRecordUpdate={vi.fn(async () => undefined)}
        onLinkReplacement={onLinkReplacement}
        onDeleteEquipment={vi.fn(async () => undefined)}
      />
    );

    expect(screen.queryByText('Choose pending replacement unit')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Replace this equipment' }));

    expect(screen.getByText(/Choose a pending replacement asset/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Gas Furnace/ })).not.toBeInTheDocument();

    const pendingOption = screen.getByRole('option', { name: /Heat Pump - Trane XR16/ });
    const replacementSelect = pendingOption.closest('select');
    expect(replacementSelect).toBeInstanceOf(HTMLSelectElement);

    fireEvent.change(replacementSelect as HTMLSelectElement, {
      target: { value: 'equipment-pending' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm replacement' }));

    expect(onLinkReplacement).toHaveBeenCalledWith('equipment-1', 'equipment-pending');
  });

  it('shows an empty replacement state when no pending replacement equipment exists', () => {
    const activeFurnace: EquipmentSummary = {
      ...equipmentRecord,
      id: 'equipment-furnace',
      equipmentType: 'Gas Furnace',
      model: '58SB0A',
      serialNumber: 'FURNACE-1',
      status: 'active'
    };

    render(
      <EquipmentPanel
        locations={[location]}
        equipment={[equipmentRecord, activeFurnace]}
        suggestedEquipmentTypes={['Condenser']}
        selectedEquipmentId="equipment-1"
        selectedEquipmentDetail={equipmentDetail}
        showInactiveEquipment={false}
        canReplaceRemove
        canDelete={false}
        onSelectEquipment={vi.fn(async () => undefined)}
        onShowInactiveChange={vi.fn()}
        onCreateEquipment={vi.fn(async () => undefined)}
        onRecordUpdate={vi.fn(async () => undefined)}
        onLinkReplacement={vi.fn(async () => undefined)}
        onDeleteEquipment={vi.fn(async () => undefined)}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Replace this equipment' }));

    expect(
      screen.getByText(/No pending replacement equipment is available for this location/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Gas Furnace/ })).not.toBeInTheDocument();
  });
});
