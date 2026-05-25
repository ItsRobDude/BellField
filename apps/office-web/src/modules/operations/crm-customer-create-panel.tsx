'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { DuplicateCandidate } from '@/lib/operations-api';
import type { CustomerFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmCustomerCreatePanelProps = {
  customerForm: CustomerFormState;
  duplicateWarnings: DuplicateCandidate[];
  onBack: () => void;
  onChangeCustomerForm: Dispatch<SetStateAction<CustomerFormState>>;
  onClearDuplicateWarnings: () => void;
  onCreateCustomer: (forceConfirm?: boolean) => void;
};

export function CrmCustomerCreatePanel({
  customerForm,
  duplicateWarnings,
  onBack,
  onChangeCustomerForm,
  onClearDuplicateWarnings,
  onCreateCustomer
}: CrmCustomerCreatePanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>Create customer</h3>
        <button type="button" onClick={onBack} style={styles.button}>
          Back
        </button>
      </div>
      <div style={styles.formRow}>
        <input
          value={customerForm.name}
          onChange={(event) => {
            onChangeCustomerForm((current) => ({ ...current, name: event.target.value }));
            onClearDuplicateWarnings();
          }}
          placeholder="Customer name"
          style={styles.input}
        />
        <select
          value={customerForm.accountType}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, accountType: event.target.value }))
          }
          style={styles.input}
        >
          <option value="residential">Residential</option>
          <option value="company">Company</option>
          <option value="propertyManager">Property manager</option>
          <option value="landlord">Landlord</option>
        </select>
        <input
          value={customerForm.billingAddressLine1}
          onChange={(event) => {
            onChangeCustomerForm((current) => ({
              ...current,
              billingAddressLine1: event.target.value
            }));
            onClearDuplicateWarnings();
          }}
          placeholder="Billing address"
          style={styles.input}
        />
        <input
          value={customerForm.billingCity}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, billingCity: event.target.value }))
          }
          placeholder="City"
          style={styles.input}
        />
        <input
          value={customerForm.billingState}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, billingState: event.target.value }))
          }
          placeholder="State"
          style={styles.input}
        />
        <input
          value={customerForm.billingPostalCode}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({
              ...current,
              billingPostalCode: event.target.value
            }))
          }
          placeholder="Postal code"
          style={styles.input}
        />
        <input
          value={customerForm.phone}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, phone: event.target.value }))
          }
          placeholder="Phone"
          style={styles.input}
        />
        <input
          value={customerForm.email}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, email: event.target.value }))
          }
          placeholder="Email"
          style={styles.input}
        />
        <input
          value={customerForm.fax}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, fax: event.target.value }))
          }
          placeholder="Fax"
          style={styles.input}
        />
        <input
          value={customerForm.flags}
          onChange={(event) =>
            onChangeCustomerForm((current) => ({ ...current, flags: event.target.value }))
          }
          placeholder="Flags (comma separated)"
          style={styles.input}
        />
      </div>
      {duplicateWarnings.length > 0 ? (
        <div style={styles.subpanel}>
          <strong>Possible duplicate customer</strong>
          {duplicateWarnings.map((warning) => (
            <div key={warning.id} style={styles.tinyMuted}>
              {warning.title} - {warning.subtitle}
            </div>
          ))}
          <div style={styles.row}>
            <button
              type="button"
              onClick={() => onCreateCustomer(true)}
              style={styles.primaryButton}
            >
              Create anyway
            </button>
            <button type="button" onClick={onClearDuplicateWarnings} style={styles.button}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
      <button type="button" onClick={() => onCreateCustomer()} style={styles.primaryButton}>
        Create customer
      </button>
    </div>
  );
}
