'use client';

import type { ContactLink, CrmWorkspaceResponse, LocationDetail } from '@/lib/operations-api';
import { ContactMethodsEditor } from './contact-methods-editor';
import type { ContactLinkDraft, LocationDetailTab } from './crm-panel-types';
import {
  CrmAgreementsSection,
  CrmActivitySection,
  CrmInvoicesSection,
  CrmJobsSection,
  CrmOperationalOverview
} from './crm-operational-sections';
import { LocationEquipmentSection } from './location-equipment-section';
import { OwnerTransferPanel } from './owner-transfer-panel';
import { RecordContactsSection } from './crm-record-contacts-section';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type LocationDetailSurfaceProps = {
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  apiBaseUrl: string;
  canDeleteEquipment: boolean;
  canReplaceRemoveEquipment: boolean;
  existingContactId: string;
  linkDrafts: Record<string, ContactLinkDraft>;
  location: LocationDetail;
  saveLocationMissingContactConfirmation: boolean;
  selectedLocationTab: LocationDetailTab;
  sessionToken: string;
  onArchiveLink: (linkId: string, isActive: boolean) => void;
  onCancelMissingContactConfirmation: () => void;
  onChangeLocation: (location: LocationDetail) => void;
  onEndDateLink: (linkId: string) => void;
  onErrorMessage: (message: string | null) => void;
  onLinkDraftChange: (contactId: string, draft: ContactLinkDraft) => void;
  onLinkExisting: () => void;
  onLocationTransferred: (location: LocationDetail) => Promise<void> | void;
  onOpenCustomer: (customerId: string) => void;
  onRefreshSelectedRecord: () => Promise<void> | void;
  onSaveLink: (link: ContactLink) => void;
  onSaveLocation: () => void;
  onSelectedLocationTabChange: (tab: LocationDetailTab) => void;
  setExistingContactId: (contactId: string) => void;
};

const locationDetailTabs: Array<{ key: LocationDetailTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'contacts', label: 'People' },
  { key: 'equipment', label: 'Equipment' },
  { key: 'agreements', label: 'Agreements' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'activity', label: 'Activity' }
];

export function LocationDetailSurface({
  activeContactOptions,
  apiBaseUrl,
  canDeleteEquipment,
  canReplaceRemoveEquipment,
  existingContactId,
  linkDrafts,
  location,
  saveLocationMissingContactConfirmation,
  selectedLocationTab,
  sessionToken,
  onArchiveLink,
  onCancelMissingContactConfirmation,
  onChangeLocation,
  onEndDateLink,
  onErrorMessage,
  onLinkDraftChange,
  onLinkExisting,
  onLocationTransferred,
  onOpenCustomer,
  onRefreshSelectedRecord,
  onSaveLink,
  onSaveLocation,
  onSelectedLocationTabChange,
  setExistingContactId
}: LocationDetailSurfaceProps) {
  return (
    <div style={styles.list}>
      <div style={styles.row}>
        <div>
          <strong>{location.name}</strong>
          <div style={styles.tinyMuted}>
            {location.customerName} - {location.addressLine1}, {location.city}
          </div>
        </div>
        <button type="button" onClick={onSaveLocation} style={styles.primaryButton}>
          Save location
        </button>
      </div>
      <div style={styles.tabList} role="tablist" aria-label="Location sections">
        {locationDetailTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selectedLocationTab === tab.key}
            onClick={() => onSelectedLocationTabChange(tab.key)}
            style={selectedLocationTab === tab.key ? styles.activeTabButton : styles.tabButton}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {selectedLocationTab === 'overview' ? (
        <>
          <CrmOperationalOverview
            operational={location.operational}
            contactMethods={location.contactMethods}
          />
          <div style={styles.formRow}>
            <input
              value={location.name}
              onChange={(event) => onChangeLocation({ ...location, name: event.target.value })}
              style={styles.input}
            />
            <input
              value={location.addressLine1}
              onChange={(event) =>
                onChangeLocation({ ...location, addressLine1: event.target.value })
              }
              style={styles.input}
            />
            <input
              value={location.city}
              onChange={(event) => onChangeLocation({ ...location, city: event.target.value })}
              style={styles.input}
            />
            <input
              value={location.state}
              onChange={(event) => onChangeLocation({ ...location, state: event.target.value })}
              style={styles.input}
            />
            <input
              value={location.postalCode}
              onChange={(event) =>
                onChangeLocation({ ...location, postalCode: event.target.value })
              }
              style={styles.input}
            />
          </div>
          {saveLocationMissingContactConfirmation ? (
            <div style={styles.subpanel}>
              <strong>Location has no phone or email</strong>
              <div style={styles.tinyMuted}>This location has no phone or email. Is that okay?</div>
              {location.fax?.trim() ? (
                <div style={styles.tinyMuted}>
                  Fax will be saved, but phone and email are still missing.
                </div>
              ) : null}
              <div style={styles.row}>
                <button type="button" onClick={onSaveLocation} style={styles.primaryButton}>
                  Save without phone or email
                </button>
                <button
                  type="button"
                  onClick={onCancelMissingContactConfirmation}
                  style={styles.button}
                >
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}
          <label style={styles.inlineLabel}>
            <input
              type="checkbox"
              checked={location.isActive}
              onChange={(event) =>
                onChangeLocation({ ...location, isActive: event.target.checked })
              }
            />
            Location is active
          </label>
          <ContactMethodsEditor
            apiBaseUrl={apiBaseUrl}
            sessionToken={sessionToken}
            ownerKind="location"
            ownerId={location.id}
            contactMethods={location.contactMethods}
            onSaved={onRefreshSelectedRecord}
          />
          <OwnerTransferPanel
            apiBaseUrl={apiBaseUrl}
            location={location}
            sessionToken={sessionToken}
            onOpenCustomer={onOpenCustomer}
            onTransferred={onLocationTransferred}
          />
        </>
      ) : null}

      {selectedLocationTab === 'equipment' ? (
        <LocationEquipmentSection
          key={location.id}
          apiBaseUrl={apiBaseUrl}
          sessionToken={sessionToken}
          location={{ id: location.id, name: location.name }}
          canReplaceRemove={canReplaceRemoveEquipment}
          canDelete={canDeleteEquipment}
          onErrorMessage={onErrorMessage}
        />
      ) : null}

      {selectedLocationTab === 'contacts' ? (
        <RecordContactsSection
          title="Location people"
          contacts={location.contacts}
          activeContactOptions={activeContactOptions}
          existingContactId={existingContactId}
          setExistingContactId={setExistingContactId}
          linkDrafts={linkDrafts}
          onLinkDraftChange={onLinkDraftChange}
          onLinkExisting={onLinkExisting}
          onSaveLink={onSaveLink}
          onEndDateLink={onEndDateLink}
          onArchiveLink={onArchiveLink}
        />
      ) : null}

      {selectedLocationTab === 'jobs' ? (
        <CrmJobsSection operational={location.operational} />
      ) : null}

      {selectedLocationTab === 'agreements' ? (
        <CrmAgreementsSection operational={location.operational} />
      ) : null}

      {selectedLocationTab === 'invoices' ? (
        <CrmInvoicesSection operational={location.operational} />
      ) : null}

      {selectedLocationTab === 'activity' ? (
        <CrmActivitySection activity={location.operational.activity} />
      ) : null}
    </div>
  );
}
