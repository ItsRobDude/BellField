'use client';

import { useState } from 'react';
import type {
  ContactMethodKind,
  ContactMethodOwnerKind,
  ContactMethodSummary
} from '@bellfield/contracts';
import {
  createOfficeContactContactMethod,
  createOfficeCustomerContactMethod,
  createOfficeLocationContactMethod,
  updateOfficeContactMethod
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type ContactMethodsEditorProps = {
  apiBaseUrl: string;
  sessionToken: string;
  ownerKind: ContactMethodOwnerKind;
  ownerId: string;
  contactMethods: ContactMethodSummary[];
  onSaved: () => Promise<void> | void;
};

const contactMethodKinds: Array<{ value: ContactMethodKind; label: string }> = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'fax', label: 'Fax' }
];

export function ContactMethodsEditor({
  apiBaseUrl,
  sessionToken,
  ownerKind,
  ownerId,
  contactMethods,
  onSaved
}: ContactMethodsEditorProps) {
  const [kind, setKind] = useState<ContactMethodKind>('phone');
  const [label, setLabel] = useState('Primary');
  const [value, setValue] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleCreateContactMethod() {
    const trimmedLabel = label.trim();
    const trimmedValue = value.trim();

    if (!trimmedLabel || !trimmedValue) {
      setErrorMessage('Label and value are required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const payload = {
        sessionToken,
        apiBaseUrl,
        kind,
        label: trimmedLabel,
        value: trimmedValue,
        isPrimary
      };

      if (ownerKind === 'customer') {
        await createOfficeCustomerContactMethod({ ...payload, customerId: ownerId });
      } else if (ownerKind === 'location') {
        await createOfficeLocationContactMethod({ ...payload, locationId: ownerId });
      } else {
        await createOfficeContactContactMethod({ ...payload, contactId: ownerId });
      }

      setValue('');
      setIsPrimary(false);
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save contact method.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetActive(contactMethodId: string, isActive: boolean) {
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await updateOfficeContactMethod({
        sessionToken,
        apiBaseUrl,
        contactMethodId,
        isActive
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update contact method.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div style={styles.subpanel}>
      <strong>Contact methods</strong>
      {contactMethods.length > 0 ? (
        <div style={styles.list}>
          {contactMethods.map((method) => (
            <div key={method.id} style={styles.panel}>
              <div style={styles.row}>
                <div>
                  <strong>
                    {method.label}: {method.value}
                  </strong>
                  <div style={styles.tinyMuted}>
                    {method.kind}
                    {method.isPrimary ? ' - primary' : ''}
                    {!method.isActive ? ' - inactive' : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSetActive(method.id, !method.isActive)}
                  style={styles.button}
                  disabled={isSaving}
                >
                  {method.isActive ? 'Archive method' : 'Reactivate method'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={styles.tinyMuted}>No contact methods recorded.</p>
      )}
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      <div style={styles.formRow}>
        <label style={styles.fieldLabel}>
          <span>Type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as ContactMethodKind)}
            style={styles.input}
          >
            {contactMethodKinds.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label style={styles.fieldLabel}>
          <span>Name</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Primary, after-hours, office"
            style={styles.input}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Number or email</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Contact value"
            style={styles.input}
          />
        </label>
      </div>
      <label style={styles.inlineLabel}>
        <input
          type="checkbox"
          checked={isPrimary}
          onChange={(event) => setIsPrimary(event.target.checked)}
        />
        Make primary for this record
      </label>
      <button
        type="button"
        onClick={() => void handleCreateContactMethod()}
        style={styles.button}
        disabled={isSaving}
      >
        Add contact method
      </button>
    </div>
  );
}
