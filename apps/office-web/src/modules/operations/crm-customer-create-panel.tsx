'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { DuplicateCandidate } from '@/lib/operations-api';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { useAsyncAction } from '@/components/use-async-action';
import type { CustomerFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmCustomerCreatePanelProps = {
  customerForm: CustomerFormState;
  duplicateWarnings: DuplicateCandidate[];
  onBack: () => void;
  onChangeCustomerForm: Dispatch<SetStateAction<CustomerFormState>>;
  onClearDuplicateWarnings: () => void;
  onCreateCustomer: (forceConfirm?: boolean) => Promise<void>;
};

export function CrmCustomerCreatePanel({
  customerForm,
  duplicateWarnings,
  onBack,
  onChangeCustomerForm,
  onClearDuplicateWarnings,
  onCreateCustomer
}: CrmCustomerCreatePanelProps) {
  const createCustomer = useAsyncAction(onCreateCustomer);

  function setField(patch: Partial<CustomerFormState>, clearsDuplicates = false) {
    onChangeCustomerForm((current) => ({ ...current, ...patch }));
    if (clearsDuplicates) {
      onClearDuplicateWarnings();
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>Create customer</h3>
        <button type="button" onClick={onBack} style={styles.button}>
          Back
        </button>
      </div>
      <div style={styles.formRow}>
        <FormField label="Customer name">
          <input
            value={customerForm.name}
            onChange={(event) => setField({ name: event.target.value }, true)}
            style={styles.input}
          />
        </FormField>
        <FormField label="Account type">
          <select
            value={customerForm.accountType}
            onChange={(event) => setField({ accountType: event.target.value })}
            style={styles.input}
          >
            <option value="residential">Residential</option>
            <option value="company">Company</option>
            <option value="propertyManager">Property manager</option>
            <option value="landlord">Landlord</option>
          </select>
        </FormField>
        <FormField label="Billing address">
          <input
            value={customerForm.billingAddressLine1}
            onChange={(event) => setField({ billingAddressLine1: event.target.value }, true)}
            style={styles.input}
          />
        </FormField>
        <FormField label="City">
          <input
            value={customerForm.billingCity}
            onChange={(event) => setField({ billingCity: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="State">
          <input
            value={customerForm.billingState}
            onChange={(event) => setField({ billingState: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Postal code">
          <input
            value={customerForm.billingPostalCode}
            onChange={(event) => setField({ billingPostalCode: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Phone">
          <input
            value={customerForm.phone}
            onChange={(event) => setField({ phone: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Email">
          <input
            value={customerForm.email}
            onChange={(event) => setField({ email: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Fax">
          <input
            value={customerForm.fax}
            onChange={(event) => setField({ fax: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Flags" hint="Comma separated">
          <input
            value={customerForm.flags}
            onChange={(event) => setField({ flags: event.target.value })}
            style={styles.input}
          />
        </FormField>
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
            <SubmitButton
              isBusy={createCustomer.isBusy}
              busyLabel="Creating…"
              onClick={() => void createCustomer.run(true)}
            >
              Create anyway
            </SubmitButton>
            <button type="button" onClick={onClearDuplicateWarnings} style={styles.button}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
      <SubmitButton
        isBusy={createCustomer.isBusy}
        busyLabel="Creating…"
        onClick={() => void createCustomer.run()}
      >
        Create customer
      </SubmitButton>
    </div>
  );
}
