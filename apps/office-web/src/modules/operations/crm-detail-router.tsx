'use client';

import type {
  ContactDetail,
  ContactLink,
  CrmWorkspaceResponse,
  CustomerDetail,
  LocationDetail
} from '@/lib/operations-api';
import { ContactDetailSurface } from './contact-detail-surface';
import type { ContactLinkDraft, CustomerDetailTab, LocationDetailTab } from './crm-panel-types';
import { CustomerDetailSurface } from './customer-detail-surface';
import { LocationDetailSurface } from './location-detail-surface';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmDetailRouterProps = {
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  apiBaseUrl: string;
  canDeleteEquipment: boolean;
  canReplaceRemoveEquipment: boolean;
  existingContactId: string;
  linkDrafts: Record<string, ContactLinkDraft>;
  saveLocationMissingContactConfirmation: boolean;
  selectedContact: ContactDetail | null;
  selectedCustomer: CustomerDetail | null;
  selectedCustomerTab: CustomerDetailTab;
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
  onLocationTransferred: (location: LocationDetail) => Promise<void> | void;
  onNewContact: () => void;
  onOpenLocation: (locationId: string) => void;
  onRefreshSelectedRecord: () => Promise<void> | void;
  onSaveContact: () => void;
  onSaveCustomer: () => void;
  onSaveLink: (link: ContactLink) => void;
  onSelectedCustomerTabChange: (tab: CustomerDetailTab) => void;
  onSaveLocation: () => void;
  onSelectedLocationTabChange: (tab: LocationDetailTab) => void;
  setExistingContactId: (contactId: string) => void;
};

export function CrmDetailRouter({
  activeContactOptions,
  apiBaseUrl,
  canDeleteEquipment,
  canReplaceRemoveEquipment,
  existingContactId,
  linkDrafts,
  saveLocationMissingContactConfirmation,
  selectedContact,
  selectedCustomer,
  selectedCustomerTab,
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
  onLocationTransferred,
  onNewContact,
  onOpenLocation,
  onRefreshSelectedRecord,
  onSaveContact,
  onSaveCustomer,
  onSaveLink,
  onSelectedCustomerTabChange,
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
          selectedCustomerTab={selectedCustomerTab}
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
          onSelectedCustomerTabChange={onSelectedCustomerTabChange}
          setExistingContactId={setExistingContactId}
        />
      ) : null}
      {selectedLocation ? (
        <LocationDetailSurface
          activeContactOptions={activeContactOptions}
          apiBaseUrl={apiBaseUrl}
          canDeleteEquipment={canDeleteEquipment}
          canReplaceRemoveEquipment={canReplaceRemoveEquipment}
          existingContactId={existingContactId}
          linkDrafts={linkDrafts}
          location={selectedLocation}
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
          onLocationTransferred={onLocationTransferred}
          onRefreshSelectedRecord={onRefreshSelectedRecord}
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
