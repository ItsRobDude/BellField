'use client';

import type { ContactLink, ContactUpdateScope, CrmWorkspaceResponse } from '@/lib/operations-api';
import type { ContactLinkDraft } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type RecordContactsSectionProps = {
  title: string;
  contacts: ContactLink[];
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  existingContactId: string;
  setExistingContactId: (value: string) => void;
  linkDrafts: Record<string, ContactLinkDraft>;
  onLinkDraftChange: (contactId: string, draft: ContactLinkDraft) => void;
  onLinkExisting: () => void;
  onSaveLink: (link: ContactLink) => void;
  onEndDateLink: (linkId: string) => void;
  onArchiveLink: (linkId: string, isActive: boolean) => void;
};

export function RecordContactsSection({
  title,
  contacts,
  activeContactOptions,
  existingContactId,
  setExistingContactId,
  linkDrafts,
  onLinkDraftChange,
  onLinkExisting,
  onSaveLink,
  onEndDateLink,
  onArchiveLink
}: RecordContactsSectionProps) {
  return (
    <div style={styles.subpanel}>
      <strong>{title}</strong>
      <div style={styles.formRow}>
        <select
          value={existingContactId}
          onChange={(event) => setExistingContactId(event.target.value)}
          style={styles.input}
        >
          {activeContactOptions.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.displayName}
            </option>
          ))}
        </select>
        <button type="button" onClick={onLinkExisting} style={styles.button}>
          Link existing contact
        </button>
      </div>
      {contacts.map((contact) => {
        const draft = linkDrafts[contact.id] ?? {
          phone: contact.phone ?? '',
          email: contact.email ?? '',
          fax: contact.fax ?? '',
          tags: contact.tags.join(', '),
          scope: 'link' as ContactUpdateScope
        };

        return (
          <div key={contact.id} style={styles.panel}>
            <div style={styles.row}>
              <div>
                <strong>{contact.displayName}</strong>
                <div style={styles.tinyMuted}>
                  {contact.endDate
                    ? `End-dated ${contact.endDate}`
                    : contact.isActive
                      ? 'Active link'
                      : 'Inactive link'}
                </div>
              </div>
              <select
                value={draft.scope}
                onChange={(event) =>
                  onLinkDraftChange(contact.id, {
                    ...draft,
                    scope: event.target.value as ContactUpdateScope
                  })
                }
                style={styles.input}
              >
                <option value="link">Save here only</option>
                <option value="global">Save everywhere</option>
              </select>
            </div>
            <div style={styles.formRow}>
              <input
                value={draft.phone}
                onChange={(event) =>
                  onLinkDraftChange(contact.id, { ...draft, phone: event.target.value })
                }
                placeholder="Phone"
                style={styles.input}
              />
              <input
                value={draft.email}
                onChange={(event) =>
                  onLinkDraftChange(contact.id, { ...draft, email: event.target.value })
                }
                placeholder="Email"
                style={styles.input}
              />
              <input
                value={draft.fax}
                onChange={(event) =>
                  onLinkDraftChange(contact.id, { ...draft, fax: event.target.value })
                }
                placeholder="Fax"
                style={styles.input}
              />
              <input
                value={draft.tags}
                onChange={(event) =>
                  onLinkDraftChange(contact.id, { ...draft, tags: event.target.value })
                }
                placeholder="Tags"
                style={styles.input}
              />
            </div>
            <div style={styles.row}>
              <button type="button" onClick={() => onSaveLink(contact)} style={styles.button}>
                Save contact update
              </button>
              <button type="button" onClick={() => onEndDateLink(contact.id)} style={styles.button}>
                End-date today
              </button>
              <button
                type="button"
                onClick={() => onArchiveLink(contact.id, !contact.isActive)}
                style={styles.button}
              >
                {contact.isActive ? 'Archive link' : 'Reactivate link'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
