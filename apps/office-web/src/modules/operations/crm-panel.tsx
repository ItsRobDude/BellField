'use client';

import { useEffect, useState } from 'react';
import type {
  ContactDetail,
  ContactLink,
  CrmSearchResult,
  CrmWorkspaceResponse,
  CustomerDetail,
  DuplicateCandidate,
  LocationDetail
} from '@/lib/operations-api';
import {
  createOfficeContact,
  createOfficeCustomer,
  createOfficeLocation,
  getOfficeContactDetail,
  getOfficeCrmWorkspace,
  getOfficeCustomerDetail,
  getOfficeLocationDetail,
  linkOfficeContact,
  reassignOfficeLocationOwner,
  updateOfficeContact,
  updateOfficeContactLink,
  updateOfficeCustomer,
  updateOfficeLocation
} from '@/lib/operations-api';
import { CrmContactCreatePanel } from './crm-contact-create-panel';
import { CrmCustomerCreatePanel } from './crm-customer-create-panel';
import { CrmDetailRouter } from './crm-detail-router';
import {
  collectCrmDuplicateWarnings,
  createContactLinkDrafts,
  createEmptyContactForm,
  createEmptyCustomerForm,
  createEmptyLocationForm,
  locationNeedsPhoneEmailConfirmation,
  splitCommaValues
} from './crm-form-helpers';
import { CrmLocationCreatePanel } from './crm-location-create-panel';
import { CrmSearchSurface } from './crm-search-surface';
import type {
  ContactFormState,
  ContactLinkDraft,
  CrmPanelMode,
  CustomerFormState,
  LocationDetailTab,
  LocationFormState
} from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import { useCrmSearch } from './use-crm-search';

type Props = {
  apiBaseUrl: string;
  sessionToken: string;
  onErrorMessage: (message: string | null) => void;
  canReplaceRemoveEquipment?: boolean;
  canDeleteEquipment?: boolean;
};

export function CrmPanel({
  apiBaseUrl,
  sessionToken,
  onErrorMessage,
  canReplaceRemoveEquipment = false,
  canDeleteEquipment = false
}: Props) {
  const [workspace, setWorkspace] = useState<CrmWorkspaceResponse | null>(null);
  const [mode, setMode] = useState<CrmPanelMode>('search');
  const [returnModeAfterContactForm, setReturnModeAfterContactForm] =
    useState<CrmPanelMode>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationDetail | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createEmptyCustomerForm());
  const [locationForm, setLocationForm] = useState<LocationFormState>(createEmptyLocationForm());
  const [contactForm, setContactForm] = useState<ContactFormState>(createEmptyContactForm());
  const [existingContactId, setExistingContactId] = useState('');
  const [reassignCustomerId, setReassignCustomerId] = useState('');
  const [reassignNote, setReassignNote] = useState('');
  const [customerDuplicateWarnings, setCustomerDuplicateWarnings] = useState<DuplicateCandidate[]>(
    []
  );
  const [locationDuplicateWarnings, setLocationDuplicateWarnings] = useState<DuplicateCandidate[]>(
    []
  );
  const [createLocationMissingContactConfirmation, setCreateLocationMissingContactConfirmation] =
    useState(false);
  const [saveLocationMissingContactConfirmation, setSaveLocationMissingContactConfirmation] =
    useState(false);
  const [crmNoticeMessage, setCrmNoticeMessage] = useState<string | null>(null);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, ContactLinkDraft>>({});
  const [selectedLocationTab, setSelectedLocationTab] = useState<LocationDetailTab>('overview');
  const { isSearching, searchResults } = useCrmSearch({
    apiBaseUrl,
    mode,
    onErrorMessage,
    searchQuery,
    sessionToken
  });

  useEffect(() => {
    void refreshWorkspace();
  }, []);

  useEffect(() => {
    if (!selectedCustomer && !selectedLocation && !selectedContact) {
      setLinkDrafts({});
    }
  }, [selectedCustomer, selectedLocation, selectedContact]);

  async function refreshWorkspace() {
    setIsRefreshing(true);
    onErrorMessage(null);

    try {
      const nextWorkspace = await getOfficeCrmWorkspace({ sessionToken, apiBaseUrl });
      setWorkspace(nextWorkspace);

      if (!locationForm.customerId && nextWorkspace.customers[0]) {
        setLocationForm((current) => ({ ...current, customerId: nextWorkspace.customers[0].id }));
      }

      if (!existingContactId && nextWorkspace.contacts[0]) {
        setExistingContactId(nextWorkspace.contacts[0].id);
      }
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load customer records.');
    } finally {
      setIsRefreshing(false);
    }
  }

  function clearSelectedRecords() {
    setSelectedCustomer(null);
    setSelectedLocation(null);
    setSelectedContact(null);
    setSelectedLocationTab('overview');
    setReassignCustomerId('');
    setReassignNote('');
  }

  function returnToSearch() {
    clearSelectedRecords();
    setMode('search');
  }

  function openNewCustomerForm() {
    setReturnModeAfterContactForm('search');
    clearSelectedRecords();
    setCustomerDuplicateWarnings([]);
    setCustomerForm(createEmptyCustomerForm());
    setMode('newCustomer');
  }

  function openNewLocationFormForCustomer(customer: CustomerDetail) {
    setLocationDuplicateWarnings([]);
    setCreateLocationMissingContactConfirmation(false);
    setSelectedCustomer(customer);
    setSelectedLocation(null);
    setSelectedContact(null);
    setLocationForm(createEmptyLocationForm(customer.id));
    setMode('newLocation');
  }

  function openNewContactForm() {
    const nextReturnMode = mode === 'customerDetail' || mode === 'locationDetail' ? mode : 'search';

    if (nextReturnMode === 'search') {
      clearSelectedRecords();
    }

    setReturnModeAfterContactForm(nextReturnMode);
    setContactForm(createEmptyContactForm());
    setMode('newContact');
  }

  function returnFromContactForm() {
    if (returnModeAfterContactForm === 'customerDetail' && selectedCustomer) {
      setMode('customerDetail');
      return;
    }

    if (returnModeAfterContactForm === 'locationDetail' && selectedLocation) {
      setMode('locationDetail');
      return;
    }

    returnToSearch();
  }

  async function selectResult(result: CrmSearchResult) {
    onErrorMessage(null);

    try {
      if (result.kind === 'customer') {
        const customer = await getOfficeCustomerDetail({
          sessionToken,
          apiBaseUrl,
          customerId: result.id
        });
        setSelectedCustomer(customer);
        setSelectedLocation(null);
        setSelectedContact(null);
        setReassignCustomerId('');
        hydrateCustomerForm(customer);
        setMode('customerDetail');
      } else if (result.kind === 'location') {
        const location = await getOfficeLocationDetail({
          sessionToken,
          apiBaseUrl,
          locationId: result.id
        });
        setSelectedCustomer(null);
        setSelectedLocation(location);
        setSelectedContact(null);
        setReassignCustomerId(location.customerId);
        hydrateLocationForm(location);
        hydrateLinkDrafts(location.contacts);
        setMode('locationDetail');
      } else {
        const contact = await getOfficeContactDetail({
          sessionToken,
          apiBaseUrl,
          contactId: result.id
        });
        setSelectedCustomer(null);
        setSelectedLocation(null);
        setSelectedContact(contact);
        hydrateContactForm(contact);
        setMode('contactDetail');
      }
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load CRM detail.');
    }
  }

  async function openLocationDetail(locationId: string) {
    onErrorMessage(null);

    try {
      const location = await getOfficeLocationDetail({
        sessionToken,
        apiBaseUrl,
        locationId
      });
      setSelectedCustomer(null);
      setSelectedLocation(location);
      setSelectedContact(null);
      setReassignCustomerId(location.customerId);
      hydrateLocationForm(location);
      hydrateLinkDrafts(location.contacts);
      setMode('locationDetail');
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load location detail.');
    }
  }

  async function handleCreateCustomer(forceConfirm = false) {
    onErrorMessage(null);

    if (!forceConfirm) {
      const duplicateResults = await collectCrmDuplicateWarnings({
        sessionToken,
        apiBaseUrl,
        query: `${customerForm.name} ${customerForm.phone} ${customerForm.billingAddressLine1} ${customerForm.billingCity}`,
        kind: 'customer'
      });

      if (duplicateResults.length > 0) {
        setCustomerDuplicateWarnings(duplicateResults);
        return;
      }
    }

    try {
      const response = await createOfficeCustomer({
        sessionToken,
        apiBaseUrl,
        name: customerForm.name,
        accountType: customerForm.accountType,
        billingAddressLine1: customerForm.billingAddressLine1,
        billingCity: customerForm.billingCity,
        billingState: customerForm.billingState,
        billingPostalCode: customerForm.billingPostalCode,
        phone: customerForm.phone || undefined,
        email: customerForm.email || undefined,
        fax: customerForm.fax || undefined,
        flags: splitCommaValues(customerForm.flags),
        confirmDuplicate: forceConfirm || customerDuplicateWarnings.length > 0
      });
      setCustomerDuplicateWarnings([]);
      setSelectedCustomer(response.customer);
      setSelectedLocation(null);
      setSelectedContact(null);
      hydrateCustomerForm(response.customer);
      setCustomerForm(createEmptyCustomerForm());
      setMode('customerDetail');
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create customer.');
    }
  }

  async function handleSaveCustomer() {
    if (!selectedCustomer) {
      return;
    }

    try {
      const response = await updateOfficeCustomer({
        customerId: selectedCustomer.id,
        sessionToken,
        apiBaseUrl,
        name: selectedCustomer.name,
        accountType: selectedCustomer.accountType,
        billingAddressLine1: selectedCustomer.billingAddressLine1,
        billingCity: selectedCustomer.billingCity,
        billingState: selectedCustomer.billingState,
        billingPostalCode: selectedCustomer.billingPostalCode,
        phone: selectedCustomer.phone,
        email: selectedCustomer.email,
        fax: selectedCustomer.fax,
        isActive: selectedCustomer.isActive,
        flags: [...selectedCustomer.flags],
        confirmDuplicate: true
      });
      setSelectedCustomer(response.customer);
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to save customer.');
    }
  }

  async function handleCreateLocation(
    options: { confirmDuplicate?: boolean; confirmMissingContactInfo?: boolean } = {}
  ) {
    onErrorMessage(null);
    const confirmMissingContactInfo =
      options.confirmMissingContactInfo || createLocationMissingContactConfirmation;

    if (
      !confirmMissingContactInfo &&
      locationNeedsPhoneEmailConfirmation(locationForm.phone, locationForm.email)
    ) {
      setCreateLocationMissingContactConfirmation(true);
      return;
    }

    if (!options.confirmDuplicate) {
      const duplicateResults = await collectCrmDuplicateWarnings({
        sessionToken,
        apiBaseUrl,
        query: `${locationForm.name} ${locationForm.phone} ${locationForm.addressLine1} ${locationForm.city}`,
        kind: 'location'
      });

      if (duplicateResults.length > 0) {
        setLocationDuplicateWarnings(duplicateResults);
        return;
      }
    }

    try {
      const response = await createOfficeLocation({
        sessionToken,
        apiBaseUrl,
        customerId: locationForm.customerId,
        name: locationForm.name,
        addressLine1: locationForm.addressLine1,
        city: locationForm.city,
        state: locationForm.state,
        postalCode: locationForm.postalCode,
        phone: locationForm.phone || undefined,
        email: locationForm.email || undefined,
        fax: locationForm.fax || undefined,
        confirmDuplicate: options.confirmDuplicate || locationDuplicateWarnings.length > 0,
        confirmMissingContactInfo
      });
      setLocationDuplicateWarnings([]);
      setCreateLocationMissingContactConfirmation(false);
      setSelectedCustomer(null);
      setSelectedLocation(response.location);
      setSelectedContact(null);
      hydrateLocationForm(response.location);
      hydrateLinkDrafts(response.location.contacts);
      setLocationForm(createEmptyLocationForm(locationForm.customerId));
      setReassignCustomerId(response.location.customerId);
      setMode('locationDetail');
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create location.');
    }
  }

  async function handleSaveLocation() {
    if (!selectedLocation) {
      return;
    }

    if (
      !saveLocationMissingContactConfirmation &&
      locationNeedsPhoneEmailConfirmation(selectedLocation.phone, selectedLocation.email)
    ) {
      setSaveLocationMissingContactConfirmation(true);
      return;
    }

    try {
      const response = await updateOfficeLocation({
        locationId: selectedLocation.id,
        sessionToken,
        apiBaseUrl,
        name: selectedLocation.name,
        addressLine1: selectedLocation.addressLine1,
        city: selectedLocation.city,
        state: selectedLocation.state,
        postalCode: selectedLocation.postalCode,
        phone: selectedLocation.phone,
        email: selectedLocation.email,
        fax: selectedLocation.fax,
        isActive: selectedLocation.isActive,
        confirmDuplicate: true,
        confirmMissingContactInfo: saveLocationMissingContactConfirmation
      });
      setSaveLocationMissingContactConfirmation(false);
      setSelectedLocation(response.location);
      hydrateLinkDrafts(response.location.contacts);
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to save location.');
    }
  }

  async function handleReassignLocation() {
    if (!selectedLocation || !reassignCustomerId) {
      return;
    }

    try {
      const response = await reassignOfficeLocationOwner({
        locationId: selectedLocation.id,
        sessionToken,
        apiBaseUrl,
        customerId: reassignCustomerId,
        note: reassignNote || undefined
      });
      setSelectedLocation(response.location);
      setReassignCustomerId(response.location.customerId);
      setReassignNote('');
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(
        error instanceof Error ? error.message : 'Unable to reassign location ownership.'
      );
    }
  }

  async function handleCreateContactAndMaybeLink() {
    try {
      const returnMode = selectedCustomer
        ? 'customerDetail'
        : selectedLocation
          ? 'locationDetail'
          : 'contactDetail';
      const response = await createOfficeContact({
        sessionToken,
        apiBaseUrl,
        displayName: contactForm.displayName,
        phone: contactForm.phone || undefined,
        email: contactForm.email || undefined,
        fax: contactForm.fax || undefined,
        tags: splitCommaValues(contactForm.tags)
      });

      const createdContact = response.contact;

      if (selectedCustomer || selectedLocation) {
        await linkOfficeContact({
          sessionToken,
          apiBaseUrl,
          contactId: createdContact.id,
          customerId: selectedCustomer?.id,
          locationId: selectedLocation?.id,
          tags: splitCommaValues(contactForm.tags)
        });
        await reloadSelectedRecord();
        setMode(returnMode);
      } else {
        setSelectedContact(createdContact);
        hydrateContactForm(createdContact);
        setMode('contactDetail');
      }

      setContactForm(createEmptyContactForm());
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to create contact.');
    }
  }

  async function handleSaveSharedContact() {
    if (!selectedContact) {
      return;
    }

    try {
      const response = await updateOfficeContact({
        contactId: selectedContact.id,
        sessionToken,
        apiBaseUrl,
        displayName: selectedContact.displayName,
        phone: selectedContact.phone,
        email: selectedContact.email,
        fax: selectedContact.fax,
        tags: [...selectedContact.tags],
        scope: 'global'
      });
      setSelectedContact(response.contact);
      await reloadSelectedRecord();
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to save contact.');
    }
  }

  async function handleLinkExistingContact() {
    if (!existingContactId || (!selectedCustomer && !selectedLocation)) {
      return;
    }

    const targetContacts = selectedCustomer?.contacts ?? selectedLocation?.contacts ?? [];
    const isAlreadyLinked = targetContacts.some(
      (contact) => contact.contactId === existingContactId
    );

    try {
      setCrmNoticeMessage(null);
      await linkOfficeContact({
        sessionToken,
        apiBaseUrl,
        contactId: existingContactId,
        customerId: selectedCustomer?.id,
        locationId: selectedLocation?.id
      });
      await reloadSelectedRecord();
      await refreshWorkspace();
      setCrmNoticeMessage(
        isAlreadyLinked
          ? 'Contact was already linked; the existing link was refreshed.'
          : 'Contact linked.'
      );
    } catch (error) {
      setCrmNoticeMessage(null);
      onErrorMessage(error instanceof Error ? error.message : 'Unable to link contact.');
    }
  }

  async function handleSaveContactLink(link: ContactLink) {
    const draft = linkDrafts[link.id];

    if (!draft) {
      return;
    }

    try {
      await updateOfficeContact({
        contactId: link.contactId,
        sessionToken,
        apiBaseUrl,
        phone: draft.phone || undefined,
        email: draft.email || undefined,
        fax: draft.fax || undefined,
        tags: splitCommaValues(draft.tags),
        scope: draft.scope,
        linkId: draft.scope === 'link' ? link.id : undefined
      });
      await reloadSelectedRecord();
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to save contact link.');
    }
  }

  async function handleEndDateContactLink(linkId: string) {
    try {
      await updateOfficeContactLink({
        linkId,
        sessionToken,
        apiBaseUrl,
        endDate: new Date().toISOString().slice(0, 10)
      });
      await reloadSelectedRecord();
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to end-date contact link.');
    }
  }

  async function handleArchiveContactLink(linkId: string, isActive: boolean) {
    try {
      await updateOfficeContactLink({
        linkId,
        sessionToken,
        apiBaseUrl,
        isActive
      });
      await reloadSelectedRecord();
      await refreshWorkspace();
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to update contact link.');
    }
  }

  async function reloadSelectedRecord() {
    if (selectedCustomer) {
      const customer = await getOfficeCustomerDetail({
        sessionToken,
        apiBaseUrl,
        customerId: selectedCustomer.id
      });
      setSelectedCustomer(customer);
      hydrateLinkDrafts(customer.contacts);
      return;
    }

    if (selectedLocation) {
      const location = await getOfficeLocationDetail({
        sessionToken,
        apiBaseUrl,
        locationId: selectedLocation.id
      });
      setSelectedLocation(location);
      hydrateLinkDrafts(location.contacts);
      return;
    }

    if (selectedContact) {
      const contact = await getOfficeContactDetail({
        sessionToken,
        apiBaseUrl,
        contactId: selectedContact.id
      });
      setSelectedContact(contact);
    }
  }

  function hydrateCustomerForm(customer: CustomerDetail) {
    setSelectedCustomer(customer);
    hydrateLinkDrafts(customer.contacts);
  }

  function hydrateLocationForm(location: LocationDetail) {
    setSelectedLocation(location);
    setSelectedLocationTab('overview');
  }

  function hydrateContactForm(contact: ContactDetail) {
    setSelectedContact(contact);
  }

  function hydrateLinkDrafts(links: ContactLink[]) {
    setLinkDrafts(createContactLinkDrafts(links));
  }

  function handleLinkDraftChange(contactId: string, draft: ContactLinkDraft) {
    setLinkDrafts((current) => ({
      ...current,
      [contactId]: draft
    }));
  }

  const activeCustomerOptions = workspace?.customers ?? [];
  const activeContactOptions = workspace?.contacts ?? [];
  const locationFormOwnerName =
    selectedCustomer?.id === locationForm.customerId
      ? selectedCustomer.name
      : (activeCustomerOptions.find((customer) => customer.id === locationForm.customerId)?.name ??
        'Selected customer');
  return (
    <section style={styles.card}>
      <div style={styles.row}>
        <div>
          <h2 style={styles.heading}>Customers</h2>
          <p style={styles.muted}>Search, review, and maintain customer records.</p>
        </div>
        <button type="button" onClick={() => void refreshWorkspace()} style={styles.button}>
          {isRefreshing ? 'Refreshing...' : 'Refresh customers'}
        </button>
      </div>

      {crmNoticeMessage ? <p style={styles.notice}>{crmNoticeMessage}</p> : null}

      {mode === 'search' ? (
        <CrmSearchSurface
          isSearching={isSearching}
          onNewCustomer={openNewCustomerForm}
          onSearchQueryChange={setSearchQuery}
          onSelectResult={(result) => void selectResult(result)}
          searchQuery={searchQuery}
          searchResults={searchResults}
        />
      ) : null}

      {mode === 'newCustomer' ? (
        <CrmCustomerCreatePanel
          customerForm={customerForm}
          duplicateWarnings={customerDuplicateWarnings}
          onBack={returnToSearch}
          onChangeCustomerForm={setCustomerForm}
          onClearDuplicateWarnings={() => setCustomerDuplicateWarnings([])}
          onCreateCustomer={(forceConfirm) => void handleCreateCustomer(forceConfirm)}
        />
      ) : null}

      {mode === 'newLocation' ? (
        <CrmLocationCreatePanel
          duplicateWarnings={locationDuplicateWarnings}
          locationForm={locationForm}
          missingContactConfirmation={createLocationMissingContactConfirmation}
          ownerCustomerName={locationFormOwnerName}
          onBack={() => {
            if (selectedCustomer) {
              setMode('customerDetail');
              return;
            }

            returnToSearch();
          }}
          onCancelMissingContactConfirmation={() =>
            setCreateLocationMissingContactConfirmation(false)
          }
          onChangeLocationForm={setLocationForm}
          onClearDuplicateWarnings={() => setLocationDuplicateWarnings([])}
          onCreateLocation={(options) => void handleCreateLocation(options)}
        />
      ) : null}

      {mode === 'newContact' ? (
        <CrmContactCreatePanel
          contactForm={contactForm}
          isLinkingToSelectedRecord={Boolean(selectedCustomer || selectedLocation)}
          onBack={returnFromContactForm}
          onChangeContactForm={setContactForm}
          onCreateContact={() => void handleCreateContactAndMaybeLink()}
        />
      ) : null}

      {(mode === 'customerDetail' || mode === 'locationDetail' || mode === 'contactDetail') &&
      (selectedCustomer || selectedLocation || selectedContact) ? (
        <CrmDetailRouter
          activeContactOptions={activeContactOptions}
          activeCustomerOptions={activeCustomerOptions}
          apiBaseUrl={apiBaseUrl}
          canDeleteEquipment={canDeleteEquipment}
          canReplaceRemoveEquipment={canReplaceRemoveEquipment}
          existingContactId={existingContactId}
          linkDrafts={linkDrafts}
          reassignCustomerId={reassignCustomerId}
          reassignNote={reassignNote}
          saveLocationMissingContactConfirmation={saveLocationMissingContactConfirmation}
          selectedContact={selectedContact}
          selectedCustomer={selectedCustomer}
          selectedLocation={selectedLocation}
          selectedLocationTab={selectedLocationTab}
          sessionToken={sessionToken}
          onAddLocation={openNewLocationFormForCustomer}
          onArchiveLink={(linkId, isActive) => void handleArchiveContactLink(linkId, isActive)}
          onBack={returnToSearch}
          onCancelMissingContactConfirmation={() =>
            setSaveLocationMissingContactConfirmation(false)
          }
          onChangeContact={(contact) => setSelectedContact(contact)}
          onChangeCustomer={(customer) => setSelectedCustomer(customer)}
          onChangeLocation={(location) => setSelectedLocation(location)}
          onEndDateLink={(linkId) => void handleEndDateContactLink(linkId)}
          onErrorMessage={onErrorMessage}
          onLinkDraftChange={handleLinkDraftChange}
          onLinkExisting={() => void handleLinkExistingContact()}
          onNewContact={openNewContactForm}
          onOpenLocation={(locationId) => void openLocationDetail(locationId)}
          onRefreshSelectedRecord={reloadSelectedRecord}
          onReassignCustomerChange={setReassignCustomerId}
          onReassignLocation={() => void handleReassignLocation()}
          onReassignNoteChange={setReassignNote}
          onSaveContact={() => void handleSaveSharedContact()}
          onSaveCustomer={() => void handleSaveCustomer()}
          onSaveLink={(link) => void handleSaveContactLink(link)}
          onSaveLocation={() => void handleSaveLocation()}
          onSelectedLocationTabChange={setSelectedLocationTab}
          setExistingContactId={setExistingContactId}
        />
      ) : null}
    </section>
  );
}
