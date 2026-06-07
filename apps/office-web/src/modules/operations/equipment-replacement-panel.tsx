'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EquipmentDetail, EquipmentSummary } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type EquipmentReplacementPanelProps = {
  equipment: EquipmentSummary[];
  selectedEquipment: EquipmentDetail;
  onLinkReplacement: (equipmentId: string, replacementEquipmentId: string) => Promise<void>;
};

export function EquipmentReplacementPanel({
  equipment,
  selectedEquipment,
  onLinkReplacement
}: EquipmentReplacementPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [replacementEquipmentId, setReplacementEquipmentId] = useState('');

  useEffect(() => {
    setIsOpen(false);
    setReplacementEquipmentId('');
  }, [selectedEquipment.id]);

  const replacementOptions = useMemo(
    () => equipment.filter((record) => isEligibleReplacementCandidate(selectedEquipment, record)),
    [equipment, selectedEquipment]
  );

  return (
    <div style={styles.subpanel}>
      {isOpen ? (
        <>
          <h4 style={styles.subheading}>Replace selected equipment</h4>
          <p style={styles.muted}>
            Choose a pending replacement asset at this location. Confirming will mark{' '}
            {selectedEquipment.equipmentType || 'this equipment'} removed and activate the
            replacement.
          </p>
          {replacementOptions.length > 0 ? (
            <>
              <select
                value={replacementEquipmentId}
                onChange={(event) => setReplacementEquipmentId(event.target.value)}
                style={styles.input}
              >
                <option value="">Choose pending replacement unit</option>
                {replacementOptions.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.equipmentType} - {record.brand} {record.model}{' '}
                    {record.serialNumber ? `(${record.serialNumber})` : ''}
                  </option>
                ))}
              </select>
              <div style={styles.row}>
                <button
                  type="button"
                  disabled={!replacementEquipmentId}
                  onClick={() =>
                    replacementEquipmentId &&
                    void onLinkReplacement(selectedEquipment.id, replacementEquipmentId)
                  }
                  style={{
                    ...styles.primaryButton,
                    ...(!replacementEquipmentId ? { cursor: 'not-allowed', opacity: 0.55 } : {})
                  }}
                >
                  Confirm replacement
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReplacementEquipmentId('');
                    setIsOpen(false);
                  }}
                  style={styles.button}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={styles.muted}>
                No pending replacement equipment is available for this location. Add or receive the
                replacement equipment first, then link it here.
              </p>
              <button type="button" onClick={() => setIsOpen(false)} style={styles.button}>
                Cancel
              </button>
            </>
          )}
        </>
      ) : (
        <button type="button" onClick={() => setIsOpen(true)} style={styles.button}>
          Replace this equipment
        </button>
      )}
    </div>
  );
}

export function canStartEquipmentReplacement(equipment: EquipmentDetail): boolean {
  return (
    equipment.status !== 'removed' &&
    equipment.status !== 'pendingInstall' &&
    !equipment.replacedByEquipmentId
  );
}

function isEligibleReplacementCandidate(
  oldEquipment: EquipmentDetail,
  candidate: EquipmentSummary
): boolean {
  return (
    candidate.id !== oldEquipment.id &&
    candidate.status === 'pendingInstall' &&
    !candidate.replacesEquipmentId &&
    !candidate.replacedByEquipmentId &&
    candidate.locationId === oldEquipment.locationId &&
    candidate.inventoryLocationLabel === oldEquipment.inventoryLocationLabel
  );
}
