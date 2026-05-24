'use client';

import { useEffect, useMemo, useState } from 'react';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { EquipmentDetail, EquipmentStatus, EquipmentSummary } from '@/lib/operations-api';

export type EquipmentCreateDraft = {
  placementKind: 'location' | 'inventory';
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyProviderNote: string;
  systemGroupName: string;
  status: EquipmentStatus;
  notes: string;
};

export type EquipmentEditDraft = {
  locationId?: string;
  inventoryLocationLabel?: string;
  equipmentType: string;
  brand: string;
  model: string;
  serialNumber: string;
  filterSizes: string;
  equipmentLocationDescription: string;
  installDate: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyProviderNote: string;
  systemGroupName: string;
  status: EquipmentStatus;
  notes: string;
};

type EquipmentPanelProps = {
  locations: Array<{ id: string; name: string }>;
  equipment: EquipmentSummary[];
  suggestedEquipmentTypes: string[];
  selectedEquipmentId?: string;
  selectedEquipmentDetail: EquipmentDetail | null;
  showInactiveEquipment: boolean;
  canReplaceRemove: boolean;
  canDelete: boolean;
  onSelectEquipment: (equipmentId: string) => Promise<void>;
  onShowInactiveChange: (value: boolean) => void;
  onCreateEquipment: (draft: EquipmentCreateDraft) => Promise<void>;
  onRecordUpdate: (recordId: string, draft: EquipmentEditDraft) => Promise<void>;
  onLinkReplacement: (equipmentId: string, replacementEquipmentId: string) => Promise<void>;
  onDeleteEquipment: (equipmentId: string) => Promise<void>;
};

export function EquipmentPanel({
  locations,
  equipment,
  suggestedEquipmentTypes,
  selectedEquipmentId,
  selectedEquipmentDetail,
  showInactiveEquipment,
  canReplaceRemove,
  canDelete,
  onSelectEquipment,
  onShowInactiveChange,
  onCreateEquipment,
  onRecordUpdate,
  onLinkReplacement,
  onDeleteEquipment
}: EquipmentPanelProps) {
  const [createDraft, setCreateDraft] = useState<EquipmentCreateDraft>(() =>
    createDefaultCreateDraft(locations[0]?.id)
  );
  const [detailDraft, setDetailDraft] = useState<EquipmentEditDraft | null>(null);
  const [replacementEquipmentId, setReplacementEquipmentId] = useState('');

  useEffect(() => {
    if (!createDraft.locationId && locations[0]) {
      setCreateDraft((current) => ({ ...current, locationId: locations[0].id }));
    }
  }, [createDraft.locationId, locations]);

  useEffect(() => {
    setDetailDraft(selectedEquipmentDetail ? createDetailDraft(selectedEquipmentDetail) : null);
    setReplacementEquipmentId('');
  }, [selectedEquipmentDetail]);

  const replacementOptions = useMemo(() => {
    if (!selectedEquipmentDetail) {
      return [];
    }

    return equipment.filter(
      (record) =>
        record.id !== selectedEquipmentDetail.id &&
        record.locationId === selectedEquipmentDetail.locationId &&
        record.inventoryLocationLabel === selectedEquipmentDetail.inventoryLocationLabel
    );
  }, [equipment, selectedEquipmentDetail]);

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
          Show inactive and removed
        </label>
      </div>

      <div style={styles.panel}>
        <div style={styles.row}>
          <h3 style={styles.subheading}>Add equipment</h3>
          <div style={styles.badgeRow}>
            <span style={styles.badge}>Serialized-unit mindset</span>
            <span style={styles.badge}>Location first</span>
          </div>
        </div>
        <div style={styles.formRow}>
          <select
            value={createDraft.placementKind}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                placementKind: event.target.value as EquipmentCreateDraft['placementKind']
              }))
            }
            style={styles.input}
          >
            <option value="location">Customer location</option>
            <option value="inventory">Inventory placement</option>
          </select>
          {createDraft.placementKind === 'location' ? (
            <select
              value={createDraft.locationId}
              onChange={(event) =>
                setCreateDraft((current) => ({ ...current, locationId: event.target.value }))
              }
              style={styles.input}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={createDraft.inventoryLocationLabel}
              onChange={(event) =>
                setCreateDraft((current) => ({
                  ...current,
                  inventoryLocationLabel: event.target.value
                }))
              }
              placeholder="Inventory placement label"
              style={styles.input}
            />
          )}
          <input
            list="equipment-type-suggestions"
            value={createDraft.equipmentType}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, equipmentType: event.target.value }))
            }
            placeholder="Equipment type"
            style={styles.input}
          />
          <input
            value={createDraft.brand}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, brand: event.target.value }))
            }
            placeholder="Brand"
            style={styles.input}
          />
          <input
            value={createDraft.model}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, model: event.target.value }))
            }
            placeholder="Model"
            style={styles.input}
          />
          <input
            value={createDraft.serialNumber}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, serialNumber: event.target.value }))
            }
            placeholder="Serial number"
            style={styles.input}
          />
          <input
            value={createDraft.filterSizes}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, filterSizes: event.target.value }))
            }
            placeholder="Filter sizes (comma separated)"
            style={styles.input}
          />
          <input
            value={createDraft.equipmentLocationDescription}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                equipmentLocationDescription: event.target.value
              }))
            }
            placeholder="Equipment location"
            style={styles.input}
          />
          <input
            value={createDraft.installDate}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, installDate: event.target.value }))
            }
            type="date"
            style={styles.input}
          />
          <input
            value={createDraft.warrantyStartDate}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, warrantyStartDate: event.target.value }))
            }
            type="date"
            style={styles.input}
          />
          <input
            value={createDraft.warrantyEndDate}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, warrantyEndDate: event.target.value }))
            }
            type="date"
            style={styles.input}
          />
          <input
            value={createDraft.systemGroupName}
            onChange={(event) =>
              setCreateDraft((current) => ({ ...current, systemGroupName: event.target.value }))
            }
            placeholder="System group name"
            style={styles.input}
          />
          <select
            value={createDraft.status}
            onChange={(event) =>
              setCreateDraft((current) => ({
                ...current,
                status: event.target.value as EquipmentStatus
              }))
            }
            style={styles.input}
          >
            <option value="active">Active</option>
            <option value="pendingInstall">Pending install</option>
            <option value="inactive">Inactive</option>
            <option value="removed">Removed</option>
          </select>
        </div>
        <input
          value={createDraft.warrantyProviderNote}
          onChange={(event) =>
            setCreateDraft((current) => ({ ...current, warrantyProviderNote: event.target.value }))
          }
          placeholder="Warranty provider or note"
          style={styles.input}
        />
        <textarea
          value={createDraft.notes}
          onChange={(event) =>
            setCreateDraft((current) => ({ ...current, notes: event.target.value }))
          }
          placeholder="Equipment notes"
          style={styles.textarea}
        />
        <button
          type="button"
          onClick={() => void onCreateEquipment(createDraft)}
          style={styles.primaryButton}
        >
          Add equipment
        </button>
        <datalist id="equipment-type-suggestions">
          {suggestedEquipmentTypes.map((equipmentType) => (
            <option key={equipmentType} value={equipmentType} />
          ))}
        </datalist>
      </div>

      <div style={styles.wideSplitGrid}>
        <div style={styles.panel}>
          <h3 style={styles.subheading}>Equipment at a glance</h3>
          <div style={styles.list}>
            {equipment.map((record) => (
              <button
                key={record.id}
                type="button"
                style={{
                  ...styles.cardButton,
                  borderColor: record.id === selectedEquipmentId ? '#1c6b57' : '#e5dcc8'
                }}
                onClick={() => void onSelectEquipment(record.id)}
              >
                <div style={styles.row}>
                  <div>
                    <strong>{record.equipmentType}</strong>
                    <div style={styles.tinyMuted}>
                      {record.locationName || record.inventoryLocationLabel || 'Unplaced'}
                    </div>
                  </div>
                  <span style={record.status === 'removed' ? styles.dangerBadge : styles.badge}>
                    {record.status}
                  </span>
                </div>
                <div style={styles.formRow}>
                  <EquipmentGlanceField label="Make" value={record.brand || 'Make pending'} />
                  <EquipmentGlanceField label="Model" value={record.model || 'Model pending'} />
                  <EquipmentGlanceField
                    label="Serial"
                    value={record.serialNumber || 'Serial pending'}
                  />
                  <EquipmentGlanceField
                    label="Filters"
                    value={
                      record.filterSizes.length > 0
                        ? record.filterSizes.join(', ')
                        : 'Filters pending'
                    }
                  />
                  <EquipmentGlanceField
                    label="Installed"
                    value={formatEquipmentInstallDate(record.installDate)}
                  />
                </div>
                <span style={styles.tinyMuted}>
                  Open details for service history, warranty notes, grouping, and replacement
                  context.
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside style={styles.drawerPanel}>
          {selectedEquipmentDetail && detailDraft ? (
            <>
              <div style={styles.row}>
                <div>
                  <h3 style={styles.subheading}>
                    {selectedEquipmentDetail.equipmentType}: {selectedEquipmentDetail.brand}{' '}
                    {selectedEquipmentDetail.model}
                  </h3>
                  <p style={styles.tinyMuted}>
                    {selectedEquipmentDetail.locationName ||
                      selectedEquipmentDetail.inventoryLocationLabel ||
                      'No placement'}
                  </p>
                </div>
                <div style={styles.badgeRow}>
                  <span
                    style={
                      selectedEquipmentDetail.status === 'removed'
                        ? styles.dangerBadge
                        : styles.badge
                    }
                  >
                    {selectedEquipmentDetail.status}
                  </span>
                  {selectedEquipmentId ? <span style={styles.badge}>Selected</span> : null}
                </div>
              </div>

              <div style={styles.formRow}>
                <input
                  list="equipment-type-suggestions"
                  value={detailDraft.equipmentType}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, equipmentType: event.target.value } : current
                    )
                  }
                  placeholder="Equipment type"
                  style={styles.input}
                />
                <input
                  value={detailDraft.brand}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, brand: event.target.value } : current
                    )
                  }
                  placeholder="Brand"
                  style={styles.input}
                />
                <input
                  value={detailDraft.model}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, model: event.target.value } : current
                    )
                  }
                  placeholder="Model"
                  style={styles.input}
                />
                <input
                  value={detailDraft.serialNumber}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, serialNumber: event.target.value } : current
                    )
                  }
                  placeholder="Serial number"
                  style={styles.input}
                />
                <input
                  value={detailDraft.filterSizes}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, filterSizes: event.target.value } : current
                    )
                  }
                  placeholder="Filter sizes (comma separated)"
                  style={styles.input}
                />
                <input
                  value={detailDraft.equipmentLocationDescription}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current
                        ? { ...current, equipmentLocationDescription: event.target.value }
                        : current
                    )
                  }
                  placeholder="Equipment location"
                  style={styles.input}
                />
                <input
                  value={detailDraft.installDate}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, installDate: event.target.value } : current
                    )
                  }
                  type="date"
                  style={styles.input}
                />
                <input
                  value={detailDraft.warrantyStartDate}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, warrantyStartDate: event.target.value } : current
                    )
                  }
                  type="date"
                  style={styles.input}
                />
                <input
                  value={detailDraft.warrantyEndDate}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, warrantyEndDate: event.target.value } : current
                    )
                  }
                  type="date"
                  style={styles.input}
                />
                <input
                  value={detailDraft.systemGroupName}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current ? { ...current, systemGroupName: event.target.value } : current
                    )
                  }
                  placeholder="System group"
                  style={styles.input}
                />
                <select
                  value={detailDraft.status}
                  onChange={(event) =>
                    setDetailDraft((current) =>
                      current
                        ? { ...current, status: event.target.value as EquipmentStatus }
                        : current
                    )
                  }
                  style={styles.input}
                >
                  <option value="active">Active</option>
                  <option value="pendingInstall">Pending install</option>
                  <option value="inactive">Inactive</option>
                  <option value="removed">Removed</option>
                </select>
              </div>

              <input
                value={detailDraft.warrantyProviderNote}
                onChange={(event) =>
                  setDetailDraft((current) =>
                    current ? { ...current, warrantyProviderNote: event.target.value } : current
                  )
                }
                placeholder="Warranty provider or note"
                style={styles.input}
              />

              <textarea
                value={detailDraft.notes}
                onChange={(event) =>
                  setDetailDraft((current) =>
                    current ? { ...current, notes: event.target.value } : current
                  )
                }
                placeholder="Equipment notes"
                style={styles.textarea}
              />

              <div style={styles.badgeRow}>
                {selectedEquipmentDetail.ageLabel ? (
                  <span style={styles.badge}>Age: {selectedEquipmentDetail.ageLabel}</span>
                ) : null}
                {selectedEquipmentDetail.replacesEquipment ? (
                  <span style={styles.badge}>
                    Replaces: {selectedEquipmentDetail.replacesEquipment.brand}{' '}
                    {selectedEquipmentDetail.replacesEquipment.model}
                  </span>
                ) : null}
                {selectedEquipmentDetail.replacedByEquipment ? (
                  <span style={styles.badge}>
                    Replaced by: {selectedEquipmentDetail.replacedByEquipment.brand}{' '}
                    {selectedEquipmentDetail.replacedByEquipment.model}
                  </span>
                ) : null}
              </div>

              <div style={styles.row}>
                <button
                  type="button"
                  onClick={() => void onRecordUpdate(selectedEquipmentDetail.id, detailDraft)}
                  style={styles.primaryButton}
                >
                  Save equipment changes
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => void onDeleteEquipment(selectedEquipmentDetail.id)}
                    style={styles.button}
                  >
                    Delete equipment
                  </button>
                ) : null}
              </div>

              {canReplaceRemove ? (
                <div style={styles.subpanel}>
                  <h4 style={styles.subheading}>Replacement link</h4>
                  <select
                    value={replacementEquipmentId}
                    onChange={(event) => setReplacementEquipmentId(event.target.value)}
                    style={styles.input}
                  >
                    <option value="">Select replacement equipment</option>
                    {replacementOptions.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.equipmentType} - {record.brand} {record.model}{' '}
                        {record.serialNumber ? `(${record.serialNumber})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      replacementEquipmentId &&
                      void onLinkReplacement(selectedEquipmentDetail.id, replacementEquipmentId)
                    }
                    style={styles.button}
                  >
                    Link replacement and mark old unit removed
                  </button>
                </div>
              ) : null}

              <div style={styles.subpanel}>
                <h4 style={styles.subheading}>History</h4>
                <ol style={styles.timeline}>
                  {selectedEquipmentDetail.history.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.actorName}</strong> - {entry.message}
                      <div style={styles.tinyMuted}>
                        {new Date(entry.occurredAt).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <>
              <h3 style={styles.subheading}>Equipment detail</h3>
              <p style={styles.muted}>
                Select a unit from the list to review warranty, grouping, replacement links, and
                history.
              </p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

function createDefaultCreateDraft(locationId?: string): EquipmentCreateDraft {
  return {
    placementKind: 'location',
    locationId,
    inventoryLocationLabel: '',
    equipmentType: 'Condenser',
    brand: 'Carrier',
    model: '',
    serialNumber: '',
    filterSizes: '16x25x1',
    equipmentLocationDescription: '',
    installDate: '',
    warrantyStartDate: '',
    warrantyEndDate: '',
    warrantyProviderNote: '',
    systemGroupName: '',
    status: 'active',
    notes: ''
  };
}

function EquipmentGlanceField({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span style={styles.tinyMuted}>{label}</span>
      <br />
      <strong>{value}</strong>
    </span>
  );
}

function formatEquipmentInstallDate(installDate: string | undefined): string {
  if (!installDate) {
    return 'Install date pending';
  }

  const [year, month, day] = installDate.split('-');

  if (!year || !month || !day) {
    return installDate;
  }

  return `${month}/${day}/${year}`;
}

function createDetailDraft(record: EquipmentDetail): EquipmentEditDraft {
  return {
    locationId: record.locationId,
    inventoryLocationLabel: record.inventoryLocationLabel,
    equipmentType: record.equipmentType,
    brand: record.brand,
    model: record.model,
    serialNumber: record.serialNumber,
    filterSizes: record.filterSizes.join(', '),
    equipmentLocationDescription: record.equipmentLocationDescription ?? '',
    installDate: record.installDate ?? '',
    warrantyStartDate: record.warrantyStartDate ?? '',
    warrantyEndDate: record.warrantyEndDate ?? '',
    warrantyProviderNote: record.warrantyProviderNote ?? '',
    systemGroupName: record.systemGroup?.name ?? '',
    status: record.status,
    notes: record.notes
  };
}
