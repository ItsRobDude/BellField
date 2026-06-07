'use client';

import { useMemo, useState } from 'react';
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
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const selectedContact = activeContactOptions.find((contact) => contact.id === existingContactId);
  const matchingContacts = useMemo(() => {
    const query = contactSearchQuery.trim().toLowerCase();

    if (query.length < 2) {
      return [];
    }

    return activeContactOptions
      .filter((contact) =>
        [
          contact.displayName,
          contact.phone ?? '',
          contact.email ?? '',
          contact.fax ?? '',
          contact.tags.join(' ')
        ]
          .join(' ')
          .toLowerCase()
          .includes(query)
      )
      .slice(0, 8);
  }, [activeContactOptions, contactSearchQuery]);

  return (
    <div style={styles.subpanel}>
      <strong>{title}</strong>
      <div style={styles.formRow}>
        <label style={styles.fieldLabel}>
          <span>Find existing person</span>
          <input
            aria-label={`${title} existing person search`}
            value={contactSearchQuery}
            onChange={(event) => {
              setContactSearchQuery(event.target.value);
              setExistingContactId('');
            }}
            placeholder="Search by name, phone, or email"
            style={styles.input}
          />
        </label>
      </div>
      {contactSearchQuery.trim().length > 0 && contactSearchQuery.trim().length < 2 ? (
        <p style={styles.tinyMuted}>Type at least 2 characters.</p>
      ) : null}
      {matchingContacts.length > 0 ? (
        <div style={styles.listCompact}>
          {matchingContacts.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => setExistingContactId(contact.id)}
              style={styles.cardButton}
              aria-pressed={existingContactId === contact.id}
            >
              <strong>{contact.displayName}</strong>
              <span style={styles.tinyMuted}>
                {[contact.phone, contact.email].filter(Boolean).join(' · ') || 'No phone/email'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {contactSearchQuery.trim().length >= 2 && matchingContacts.length === 0 ? (
        <p style={styles.tinyMuted}>No matching people.</p>
      ) : null}
      <div style={styles.inlineActionBar}>
        <span style={styles.tinyMuted}>
          {selectedContact ? `Selected: ${selectedContact.displayName}` : 'No person selected'}
        </span>
        <button
          type="button"
          onClick={onLinkExisting}
          style={styles.button}
          disabled={!selectedContact}
        >
          Link existing person
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
                Save person update
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
