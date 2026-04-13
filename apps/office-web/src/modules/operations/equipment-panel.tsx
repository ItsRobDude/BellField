import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { EquipmentStatus, EquipmentSummary, LocationSummary } from '@/lib/operations-api';

type EquipmentPanelProps = {
  locations: LocationSummary[];
  equipment: EquipmentSummary[];
  equipmentLocationId: string;
  equipmentType: string;
  equipmentBrand: string;
  equipmentModel: string;
  equipmentSerial: string;
  equipmentFilterSizes: string;
  equipmentLocationDescription: string;
  equipmentInstallDate: string;
  equipmentNotes: string;
  equipmentStatus: EquipmentStatus;
  showInactiveEquipment: boolean;
  onEquipmentLocationChange: (value: string) => void;
  onEquipmentTypeChange: (value: string) => void;
  onEquipmentBrandChange: (value: string) => void;
  onEquipmentModelChange: (value: string) => void;
  onEquipmentSerialChange: (value: string) => void;
  onEquipmentFilterSizesChange: (value: string) => void;
  onEquipmentLocationDescriptionChange: (value: string) => void;
  onEquipmentInstallDateChange: (value: string) => void;
  onEquipmentNotesChange: (value: string) => void;
  onEquipmentStatusChange: (value: EquipmentStatus) => void;
  onShowInactiveChange: (value: boolean) => void;
  onCreateEquipment: () => Promise<void>;
  onRecordStatusChange: (record: EquipmentSummary, nextStatus: EquipmentStatus) => Promise<void>;
};

export function EquipmentPanel({
  locations,
  equipment,
  equipmentLocationId,
  equipmentType,
  equipmentBrand,
  equipmentModel,
  equipmentSerial,
  equipmentFilterSizes,
  equipmentLocationDescription,
  equipmentInstallDate,
  equipmentNotes,
  equipmentStatus,
  showInactiveEquipment,
  onEquipmentLocationChange,
  onEquipmentTypeChange,
  onEquipmentBrandChange,
  onEquipmentModelChange,
  onEquipmentSerialChange,
  onEquipmentFilterSizesChange,
  onEquipmentLocationDescriptionChange,
  onEquipmentInstallDateChange,
  onEquipmentNotesChange,
  onEquipmentStatusChange,
  onShowInactiveChange,
  onCreateEquipment,
  onRecordStatusChange
}: EquipmentPanelProps) {
  return (
    <section style={styles.card}>
      <div style={styles.row}>
        <h2 style={styles.heading}>Equipment</h2>
        <label style={styles.inlineLabel}>
          <input
            type="checkbox"
            checked={showInactiveEquipment}
            onChange={(event) => onShowInactiveChange(event.target.checked)}
          />
          Show inactive
        </label>
      </div>
      <div style={styles.formRow}>
        <select value={equipmentLocationId} onChange={(event) => onEquipmentLocationChange(event.target.value)} style={styles.input}>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
        <input value={equipmentType} onChange={(event) => onEquipmentTypeChange(event.target.value)} placeholder="Type" style={styles.input} />
        <input value={equipmentBrand} onChange={(event) => onEquipmentBrandChange(event.target.value)} placeholder="Brand" style={styles.input} />
        <input value={equipmentModel} onChange={(event) => onEquipmentModelChange(event.target.value)} placeholder="Model" style={styles.input} />
        <input value={equipmentSerial} onChange={(event) => onEquipmentSerialChange(event.target.value)} placeholder="Serial" style={styles.input} />
        <input value={equipmentFilterSizes} onChange={(event) => onEquipmentFilterSizesChange(event.target.value)} placeholder="Filters (comma separated)" style={styles.input} />
        <input value={equipmentLocationDescription} onChange={(event) => onEquipmentLocationDescriptionChange(event.target.value)} placeholder="Equipment location" style={styles.input} />
        <input value={equipmentInstallDate} onChange={(event) => onEquipmentInstallDateChange(event.target.value)} type="date" style={styles.input} />
        <select value={equipmentStatus} onChange={(event) => onEquipmentStatusChange(event.target.value as EquipmentStatus)} style={styles.input}>
          <option value="active">Active</option>
          <option value="pendingInstall">Pending install</option>
          <option value="inactive">Inactive</option>
        </select>
        <button type="button" onClick={() => void onCreateEquipment()} style={styles.button}>
          Add equipment
        </button>
      </div>
      <textarea
        value={equipmentNotes}
        onChange={(event) => onEquipmentNotesChange(event.target.value)}
        placeholder="Notes for this equipment record"
        style={styles.textarea}
      />
      <div style={styles.grid}>
        {equipment.map((record) => (
          <article key={record.id} style={styles.panel}>
            <strong>
              {record.equipmentType}: {record.brand} {record.model}
            </strong>
            <div style={styles.muted}>{record.locationName || record.inventoryLocationLabel}</div>
            <div style={styles.muted}>Serial: {record.serialNumber}</div>
            <div style={styles.muted}>Filters: {record.filterSizes.join(', ') || 'None entered'}</div>
            <div style={styles.muted}>Notes: {record.notes || 'No notes yet.'}</div>
            <select
              value={record.status}
              onChange={(event) => void onRecordStatusChange(record, event.target.value as EquipmentStatus)}
              style={styles.input}
            >
              <option value="active">Active</option>
              <option value="pendingInstall">Pending install</option>
              <option value="inactive">Inactive</option>
            </select>
          </article>
        ))}
      </div>
    </section>
  );
}
