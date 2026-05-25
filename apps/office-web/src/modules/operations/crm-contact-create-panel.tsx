'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { ContactFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmContactCreatePanelProps = {
  contactForm: ContactFormState;
  isLinkingToSelectedRecord: boolean;
  onBack: () => void;
  onChangeContactForm: Dispatch<SetStateAction<ContactFormState>>;
  onCreateContact: () => void;
};

export function CrmContactCreatePanel({
  contactForm,
  isLinkingToSelectedRecord,
  onBack,
  onChangeContactForm,
  onCreateContact
}: CrmContactCreatePanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>New contact</h3>
        <button type="button" onClick={onBack} style={styles.button}>
          Back
        </button>
      </div>
      <div style={styles.formRow}>
        <input
          value={contactForm.displayName}
          onChange={(event) =>
            onChangeContactForm((current) => ({ ...current, displayName: event.target.value }))
          }
          placeholder="Display name"
          style={styles.input}
        />
        <input
          value={contactForm.phone}
          onChange={(event) =>
            onChangeContactForm((current) => ({ ...current, phone: event.target.value }))
          }
          placeholder="Phone"
          style={styles.input}
        />
        <input
          value={contactForm.email}
          onChange={(event) =>
            onChangeContactForm((current) => ({ ...current, email: event.target.value }))
          }
          placeholder="Email"
          style={styles.input}
        />
        <input
          value={contactForm.fax}
          onChange={(event) =>
            onChangeContactForm((current) => ({ ...current, fax: event.target.value }))
          }
          placeholder="Fax"
          style={styles.input}
        />
        <input
          value={contactForm.tags}
          onChange={(event) =>
            onChangeContactForm((current) => ({ ...current, tags: event.target.value }))
          }
          placeholder="Tags (comma separated)"
          style={styles.input}
        />
      </div>
      <button type="button" onClick={onCreateContact} style={styles.primaryButton}>
        {isLinkingToSelectedRecord ? 'Create and link contact' : 'Create contact'}
      </button>
    </div>
  );
}
