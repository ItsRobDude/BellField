'use client';

import { useEffect, useState } from 'react';
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

type ContactMethodDraft = {
  label: string;
  value: string;
  isPrimary: boolean;
  isActive: boolean;
};

type ContactMethodKindUi = {
  value: ContactMethodKind;
  label: string;
  valueLabel: string;
  placeholder: string;
  inputType: 'email' | 'tel';
  inputMode: 'email' | 'tel';
  autoComplete: string;
  addButtonLabel: string;
};

const contactMethodKinds: ContactMethodKindUi[] = [
  {
    value: 'phone',
    label: 'Phone',
    valueLabel: 'Phone number',
    placeholder: '(555) 123-4567',
    inputType: 'tel',
    inputMode: 'tel',
    autoComplete: 'tel',
    addButtonLabel: 'Add phone'
  },
  {
    value: 'email',
    label: 'Email',
    valueLabel: 'Email address',
    placeholder: 'name@example.com',
    inputType: 'email',
    inputMode: 'email',
    autoComplete: 'email',
    addButtonLabel: 'Add email'
  },
  {
    value: 'fax',
    label: 'Fax',
    valueLabel: 'Fax number',
    placeholder: '(555) 123-4567',
    inputType: 'tel',
    inputMode: 'tel',
    autoComplete: 'off',
    addButtonLabel: 'Add fax'
  }
];

function getContactMethodKindUi(kind: ContactMethodKind): ContactMethodKindUi {
  return contactMethodKinds.find((option) => option.value === kind) ?? contactMethodKinds[0];
}

function validateContactMethodValue(kind: ContactMethodKind, value: string): string | null {
  if (kind === 'email') {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'Enter a valid email address.';
  }

  const digitCount = value.replace(/\D/g, '').length;

  if (digitCount < 7) {
    return kind === 'fax' ? 'Enter a valid fax number.' : 'Enter a valid phone number.';
  }

  return null;
}

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
  const [drafts, setDrafts] = useState<Record<string, ContactMethodDraft>>({});
  const selectedKindUi = getContactMethodKindUi(kind);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        contactMethods.map((method) => [
          method.id,
          {
            label: method.label,
            value: method.value,
            isPrimary: method.isPrimary,
            isActive: method.isActive
          }
        ])
      )
    );
  }, [contactMethods]);

  async function handleCreateContactMethod() {
    const trimmedLabel = label.trim();
    const trimmedValue = value.trim();

    if (!trimmedLabel || !trimmedValue) {
      setErrorMessage('Label and value are required.');
      return;
    }

    const valueError = validateContactMethodValue(kind, trimmedValue);

    if (valueError) {
      setErrorMessage(valueError);
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

  async function handleUpdateContactMethod(contactMethodId: string, methodKind: ContactMethodKind) {
    const draft = drafts[contactMethodId];

    if (!draft) {
      return;
    }

    const trimmedLabel = draft.label.trim();
    const trimmedValue = draft.value.trim();

    if (!trimmedLabel || !trimmedValue) {
      setErrorMessage('Label and value are required.');
      return;
    }

    const valueError = validateContactMethodValue(methodKind, trimmedValue);

    if (valueError) {
      setErrorMessage(valueError);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await updateOfficeContactMethod({
        sessionToken,
        apiBaseUrl,
        contactMethodId,
        label: trimmedLabel,
        value: trimmedValue,
        isPrimary: draft.isPrimary,
        isActive: draft.isActive
      });
      await onSaved();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to update contact method.');
    } finally {
      setIsSaving(false);
    }
  }

  function updateMethodDraft(contactMethodId: string, patch: Partial<ContactMethodDraft>) {
    setDrafts((current) => {
      const currentDraft = current[contactMethodId];

      if (!currentDraft) {
        return current;
      }

      return {
        ...current,
        [contactMethodId]: { ...currentDraft, ...patch }
      };
    });
  }

  return (
    <div style={styles.subpanel}>
      <strong>Contact methods</strong>
      {contactMethods.length > 0 ? (
        <div style={styles.list}>
          {contactMethods.map((method) => {
            const draft = drafts[method.id] ?? {
              label: method.label,
              value: method.value,
              isPrimary: method.isPrimary,
              isActive: method.isActive
            };
            const methodKindUi = getContactMethodKindUi(method.kind);

            return (
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
                  <label style={styles.inlineLabel}>
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(event) =>
                        updateMethodDraft(method.id, { isActive: event.target.checked })
                      }
                    />
                    Active
                  </label>
                </div>
                <div style={styles.formRow}>
                  <label style={styles.fieldLabel}>
                    <span>Name</span>
                    <input
                      value={draft.label}
                      onChange={(event) =>
                        updateMethodDraft(method.id, { label: event.target.value })
                      }
                      style={styles.input}
                    />
                  </label>
                  <label style={styles.fieldLabel}>
                    <span>{methodKindUi.valueLabel}</span>
                    <input
                      type={methodKindUi.inputType}
                      inputMode={methodKindUi.inputMode}
                      autoComplete={methodKindUi.autoComplete}
                      value={draft.value}
                      onChange={(event) =>
                        updateMethodDraft(method.id, { value: event.target.value })
                      }
                      placeholder={methodKindUi.placeholder}
                      style={styles.input}
                    />
                  </label>
                </div>
                <div style={styles.inlineActionBar}>
                  <label style={styles.inlineLabel}>
                    <input
                      type="checkbox"
                      checked={draft.isPrimary}
                      onChange={(event) =>
                        updateMethodDraft(method.id, { isPrimary: event.target.checked })
                      }
                    />
                    Primary
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleUpdateContactMethod(method.id, method.kind)}
                    style={styles.button}
                    disabled={isSaving}
                  >
                    Save method
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={styles.tinyMuted}>No contact methods recorded.</p>
      )}
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      <div style={styles.inlineActionBar} aria-label="Contact method type">
        {contactMethodKinds.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setKind(option.value);
              setErrorMessage(null);
            }}
            style={option.value === kind ? styles.primaryButton : styles.button}
            aria-pressed={option.value === kind}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div style={styles.formRow}>
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
          <span>{selectedKindUi.valueLabel}</span>
          <input
            type={selectedKindUi.inputType}
            inputMode={selectedKindUi.inputMode}
            autoComplete={selectedKindUi.autoComplete}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={selectedKindUi.placeholder}
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
        {selectedKindUi.addButtonLabel}
      </button>
    </div>
  );
}
