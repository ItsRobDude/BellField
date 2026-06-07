'use client';

import type {
  ContactDetail,
  ContactLink,
  CrmWorkspaceResponse,
  CustomerDetail,
  LocationDetail
} from '@/lib/operations-api';
import { ContactDetailSurface } from './contact-detail-surface';
import type { ContactLinkDraft, LocationDetailTab } from './crm-panel-types';
import { CustomerDetailSurface } from './customer-detail-surface';
import { LocationDetailSurface } from './location-detail-surface';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmDetailRouterProps = {
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  activeCustomerOptions: CrmWorkspaceResponse['customers'];
  apiBaseUrl: string;
  canDeleteEquipment: boolean;
  canReplaceRemoveEquipment: boolean;
  existingContactId: string;
  linkDrafts: Record<string, ContactLinkDraft>;
  reassignCustomerId: string;
  reassignNote: string;
  saveLocationMissingContactConfirmation: boolean;
  selectedContact: ContactDetail | null;
  selectedCustomer: CustomerDetail | null;
  selectedLocation: LocationDetail | null;
  selectedLocationTab: LocationDetailTab;
  sessionToken: string;
  onAddLocation: (customer: CustomerDetail) => void;
  onArchiveLink: (linkId: string, isActive: boolean) => void;
  onBack: () => void;
  onCancelMissingContactConfirmation: () => void;
  onChangeContact: (contact: ContactDetail) => void;
  onChangeCustomer: (customer: CustomerDetail) => void;
  onChangeLocation: (location: LocationDetail) => void;
  onEndDateLink: (linkId: string) => void;
  onErrorMessage: (message: string | null) => void;
  onLinkDraftChange: (contactId: string, draft: ContactLinkDraft) => void;
  onLinkExisting: () => void;
  onNewContact: () => void;
  onOpenLocation: (locationId: string) => void;
  onRefreshSelectedRecord: () => Promise<void> | void;
  onReassignCustomerChange: (customerId: string) => void;
  onReassignLocation: () => void;
  onReassignNoteChange: (note: string) => void;
  onSaveContact: () => void;
  onSaveCustomer: () => void;
  onSaveLink: (link: ContactLink) => void;
  onSaveLocation: () => void;
  onSelectedLocationTabChange: (tab: LocationDetailTab) => void;
  setExistingContactId: (contactId: string) => void;
};

export function CrmDetailRouter({
  activeContactOptions,
  activeCustomerOptions,
  apiBaseUrl,
  canDeleteEquipment,
  canReplaceRemoveEquipment,
  existingContactId,
  linkDrafts,
  reassignCustomerId,
  reassignNote,
  saveLocationMissingContactConfirmation,
  selectedContact,
  selectedCustomer,
  selectedLocation,
  selectedLocationTab,
  sessionToken,
  onAddLocation,
  onArchiveLink,
  onBack,
  onCancelMissingContactConfirmation,
  onChangeContact,
  onChangeCustomer,
  onChangeLocation,
  onEndDateLink,
  onErrorMessage,
  onLinkDraftChange,
  onLinkExisting,
  onNewContact,
  onOpenLocation,
  onRefreshSelectedRecord,
  onReassignCustomerChange,
  onReassignLocation,
  onReassignNoteChange,
  onSaveContact,
  onSaveCustomer,
  onSaveLink,
  onSaveLocation,
  onSelectedLocationTabChange,
  setExistingContactId
}: CrmDetailRouterProps) {
  const selectedDetailHeading = selectedCustomer
    ? 'Customer'
    : selectedLocation
      ? 'Location'
      : 'Contact';

  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>{selectedDetailHeading}</h3>
        <div style={styles.inlineActionBar}>
          {selectedCustomer ? (
            <button
              type="button"
              onClick={() => onAddLocation(selectedCustomer)}
              style={styles.button}
            >
              Add location
            </button>
          ) : null}
          {selectedCustomer || selectedLocation ? (
            <button type="button" onClick={onNewContact} style={styles.button}>
              New contact
            </button>
          ) : null}
          <button type="button" onClick={onBack} style={styles.button}>
            Back
          </button>
        </div>
      </div>
      {selectedCustomer ? (
        <CustomerDetailSurface
          activeContactOptions={activeContactOptions}
          apiBaseUrl={apiBaseUrl}
          customer={selectedCustomer}
          existingContactId={existingContactId}
          linkDrafts={linkDrafts}
          sessionToken={sessionToken}
          onAddLocation={() => onAddLocation(selectedCustomer)}
          onArchiveLink={onArchiveLink}
          onChangeCustomer={onChangeCustomer}
          onEndDateLink={onEndDateLink}
          onLinkDraftChange={onLinkDraftChange}
          onLinkExisting={onLinkExisting}
          onOpenLocation={onOpenLocation}
          onRefreshSelectedRecord={onRefreshSelectedRecord}
          onSaveCustomer={onSaveCustomer}
          onSaveLink={onSaveLink}
          setExistingContactId={setExistingContactId}
        />
      ) : null}
      {selectedLocation ? (
        <LocationDetailSurface
          activeContactOptions={activeContactOptions}
          activeCustomerOptions={activeCustomerOptions}
          apiBaseUrl={apiBaseUrl}
          canDeleteEquipment={canDeleteEquipment}
          canReplaceRemoveEquipment={canReplaceRemoveEquipment}
          existingContactId={existingContactId}
          linkDrafts={linkDrafts}
          location={selectedLocation}
          reassignCustomerId={reassignCustomerId}
          reassignNote={reassignNote}
          saveLocationMissingContactConfirmation={saveLocationMissingContactConfirmation}
          selectedLocationTab={selectedLocationTab}
          sessionToken={sessionToken}
          onArchiveLink={onArchiveLink}
          onCancelMissingContactConfirmation={onCancelMissingContactConfirmation}
          onChangeLocation={onChangeLocation}
          onEndDateLink={onEndDateLink}
          onErrorMessage={onErrorMessage}
          onLinkDraftChange={onLinkDraftChange}
          onLinkExisting={onLinkExisting}
          onRefreshSelectedRecord={onRefreshSelectedRecord}
          onReassignCustomerChange={onReassignCustomerChange}
          onReassignLocation={onReassignLocation}
          onReassignNoteChange={onReassignNoteChange}
          onSaveLink={onSaveLink}
          onSaveLocation={onSaveLocation}
          onSelectedLocationTabChange={onSelectedLocationTabChange}
          setExistingContactId={setExistingContactId}
        />
      ) : null}
      {selectedContact ? (
        <ContactDetailSurface
          apiBaseUrl={apiBaseUrl}
          contact={selectedContact}
          sessionToken={sessionToken}
          onChangeContact={onChangeContact}
          onRefreshSelectedRecord={onRefreshSelectedRecord}
          onSaveContact={onSaveContact}
        />
      ) : null}
    </div>
  );
}
