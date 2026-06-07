'use client';

import type { ContactDetail } from '@/lib/operations-api';
import { ContactMethodsEditor } from './contact-methods-editor';
import { splitCommaValues } from './crm-form-helpers';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type ContactDetailSurfaceProps = {
  apiBaseUrl: string;
  contact: ContactDetail;
  sessionToken: string;
  onChangeContact: (contact: ContactDetail) => void;
  onRefreshSelectedRecord: () => Promise<void> | void;
  onSaveContact: () => void;
};

export function ContactDetailSurface({
  apiBaseUrl,
  contact,
  sessionToken,
  onChangeContact,
  onRefreshSelectedRecord,
  onSaveContact
}: ContactDetailSurfaceProps) {
  return (
    <div style={styles.list}>
      <div style={styles.row}>
        <div>
          <strong>{contact.displayName}</strong>
          {!contact.isActive ? <span style={styles.badge}>Inactive</span> : null}
        </div>
        <button type="button" onClick={onSaveContact} style={styles.primaryButton}>
          Save contact
        </button>
      </div>
      <div style={styles.formRow}>
        <input
          value={contact.displayName}
          onChange={(event) => onChangeContact({ ...contact, displayName: event.target.value })}
          style={styles.input}
        />
        <input
          value={contact.phone ?? ''}
          onChange={(event) =>
            onChangeContact({ ...contact, phone: event.target.value || undefined })
          }
          style={styles.input}
        />
        <input
          value={contact.email ?? ''}
          onChange={(event) =>
            onChangeContact({ ...contact, email: event.target.value || undefined })
          }
          style={styles.input}
        />
        <input
          value={contact.fax ?? ''}
          onChange={(event) =>
            onChangeContact({ ...contact, fax: event.target.value || undefined })
          }
          style={styles.input}
        />
        <input
          value={contact.tags.join(', ')}
          onChange={(event) =>
            onChangeContact({ ...contact, tags: splitCommaValues(event.target.value) })
          }
          style={styles.input}
        />
      </div>
      <ContactMethodsEditor
        apiBaseUrl={apiBaseUrl}
        sessionToken={sessionToken}
        ownerKind="contact"
        ownerId={contact.id}
        contactMethods={contact.contactMethods}
        onSaved={onRefreshSelectedRecord}
      />
      <div style={styles.subpanel}>
        <strong>Linked records</strong>
        {contact.linkedRecords.map((link) => (
          <div key={link.id} style={styles.tinyMuted}>
            {link.linkedRecord.kind}: {link.linkedRecord.name} - {link.linkedRecord.subtitle}
            {link.endDate ? ` (end-dated ${link.endDate})` : ''}
            {!link.isActive ? ' (inactive)' : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
