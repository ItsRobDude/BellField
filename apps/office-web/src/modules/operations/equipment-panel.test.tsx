import { render, screen } from '@testing-library/react';
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
});
