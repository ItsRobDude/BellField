'use client';

import type { CrmWorkspaceResponse } from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmLocationOwnerSectionProps = {
  activeCustomerOptions: CrmWorkspaceResponse['customers'];
  reassignCustomerId: string;
  reassignNote: string;
  onReassignCustomerChange: (customerId: string) => void;
  onReassignNoteChange: (note: string) => void;
  onSubmit: () => void;
};

export function CrmLocationOwnerSection({
  activeCustomerOptions,
  reassignCustomerId,
  reassignNote,
  onReassignCustomerChange,
  onReassignNoteChange,
  onSubmit
}: CrmLocationOwnerSectionProps) {
  return (
    <div style={styles.subpanel}>
      <strong>Reassign owner</strong>
      <div style={styles.formRow}>
        <select
          value={reassignCustomerId}
          onChange={(event) => onReassignCustomerChange(event.target.value)}
          style={styles.input}
        >
          {activeCustomerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        <input
          value={reassignNote}
          onChange={(event) => onReassignNoteChange(event.target.value)}
          placeholder="Reason or note"
          style={styles.input}
        />
        <button type="button" onClick={onSubmit} style={styles.button}>
          Reassign owner
        </button>
      </div>
    </div>
  );
}
