'use client';

import type { Dispatch, SetStateAction } from 'react';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { useAsyncAction } from '@/components/use-async-action';
import type { ContactFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmContactCreatePanelProps = {
  contactForm: ContactFormState;
  isLinkingToSelectedRecord: boolean;
  onBack: () => void;
  onChangeContactForm: Dispatch<SetStateAction<ContactFormState>>;
  onCreateContact: () => Promise<void>;
};

export function CrmContactCreatePanel({
  contactForm,
  isLinkingToSelectedRecord,
  onBack,
  onChangeContactForm,
  onCreateContact
}: CrmContactCreatePanelProps) {
  const createContact = useAsyncAction(onCreateContact);

  function setField(patch: Partial<ContactFormState>) {
    onChangeContactForm((current) => ({ ...current, ...patch }));
  }

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>New contact</h3>
        <button type="button" onClick={onBack} style={styles.button}>
          Back
        </button>
      </div>
      <div style={styles.formRow}>
        <FormField label="Display name">
          <input
            value={contactForm.displayName}
            onChange={(event) => setField({ displayName: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Phone">
          <input
            value={contactForm.phone}
            onChange={(event) => setField({ phone: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Email">
          <input
            value={contactForm.email}
            onChange={(event) => setField({ email: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Fax">
          <input
            value={contactForm.fax}
            onChange={(event) => setField({ fax: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Tags" hint="Comma separated">
          <input
            value={contactForm.tags}
            onChange={(event) => setField({ tags: event.target.value })}
            style={styles.input}
          />
        </FormField>
      </div>
      <SubmitButton
        isBusy={createContact.isBusy}
        busyLabel="Creating…"
        onClick={() => void createContact.run()}
      >
        {isLinkingToSelectedRecord ? 'Create and link contact' : 'Create contact'}
      </SubmitButton>
    </div>
  );
}
