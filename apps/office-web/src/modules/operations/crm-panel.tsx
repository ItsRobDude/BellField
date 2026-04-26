'use client';

import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  ContactDetail,
  ContactLink,
  ContactUpdateScope,
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
  searchOfficeCrm,
  updateOfficeContact,
  updateOfficeContactLink,
  updateOfficeCustomer,
  updateOfficeLocation
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type Props = {
  apiBaseUrl: string;
  sessionToken: string;
  onErrorMessage: (message: string | null) => void;
};

type CustomerFormState = {
  name: string;
  accountType: string;
  billingAddressLine1: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  phone: string;
  email: string;
  fax: string;
  flags: string;
};

type LocationFormState = {
  customerId: string;
  name: string;
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  email: string;
  fax: string;
  alternateBillToCustomerIds: string[];
};

type ContactFormState = {
  displayName: string;
  phone: string;
  email: string;
  fax: string;
  tags: string;
};

type ContactLinkDraft = {
  phone: string;
  email: string;
  fax: string;
  tags: string;
  scope: ContactUpdateScope;
};

export function CrmPanel({ apiBaseUrl, sessionToken, onErrorMessage }: Props) {
  const [workspace, setWorkspace] = useState<CrmWorkspaceResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CrmSearchResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerDetail | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationDetail | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createEmptyCustomerForm());
  const [locationForm, setLocationForm] = useState<LocationFormState>(createEmptyLocationForm());
  const [contactForm, setContactForm] = useState<ContactFormState>(createEmptyContactForm());
  const [existingContactId, setExistingContactId] = useState('');
  const [reassignCustomerId, setReassignCustomerId] = useState('');
  const [reassignNote, setReassignNote] = useState('');
  const [customerDuplicateWarnings, setCustomerDuplicateWarnings] = useState<DuplicateCandidate[]>([]);
  const [locationDuplicateWarnings, setLocationDuplicateWarnings] = useState<DuplicateCandidate[]>([]);
  const [createLocationMissingContactConfirmation, setCreateLocationMissingContactConfirmation] = useState(false);
  const [saveLocationMissingContactConfirmation, setSaveLocationMissingContactConfirmation] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<Record<string, ContactLinkDraft>>({});

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
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load CRM workspace.');
    } finally {
      setIsRefreshing(false);
    }
  }

  async function runSearch(query = searchQuery) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    onErrorMessage(null);

    try {
      const response = await searchOfficeCrm({ sessionToken, apiBaseUrl, query });
      setSearchResults(response.results);
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to search CRM records.');
    } finally {
      setIsSearching(false);
    }
  }

  async function selectResult(result: CrmSearchResult) {
    onErrorMessage(null);

    try {
      if (result.kind === 'customer') {
        const customer = await getOfficeCustomerDetail({ sessionToken, apiBaseUrl, customerId: result.id });
        setSelectedCustomer(customer);
        setSelectedLocation(null);
        setSelectedContact(null);
        setReassignCustomerId('');
        hydrateCustomerForm(customer);
      } else if (result.kind === 'location') {
        const location = await getOfficeLocationDetail({ sessionToken, apiBaseUrl, locationId: result.id });
        setSelectedCustomer(null);
        setSelectedLocation(location);
        setSelectedContact(null);
        setReassignCustomerId(location.customerId);
        hydrateLocationForm(location);
        hydrateLinkDrafts(location.contacts);
      } else {
        const contact = await getOfficeContactDetail({ sessionToken, apiBaseUrl, contactId: result.id });
        setSelectedCustomer(null);
        setSelectedLocation(null);
        setSelectedContact(contact);
        hydrateContactForm(contact);
      }
    } catch (error) {
      onErrorMessage(error instanceof Error ? error.message : 'Unable to load CRM detail.');
    }
  }

  async function handleCreateCustomer(forceConfirm = false) {
    onErrorMessage(null);

    if (!forceConfirm) {
      const duplicateResults = await collectDuplicateWarnings(
        `${customerForm.name} ${customerForm.phone} ${customerForm.billingAddressLine1} ${customerForm.billingCity}`,
        'customer'
      );

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

  async function handleCreateLocation(options: { confirmDuplicate?: boolean; confirmMissingContactInfo?: boolean } = {}) {
    onErrorMessage(null);
    const confirmMissingContactInfo =
      options.confirmMissingContactInfo || createLocationMissingContactConfirmation;

    if (!confirmMissingContactInfo && locationNeedsPhoneEmailConfirmation(locationForm.phone, locationForm.email)) {
      setCreateLocationMissingContactConfirmation(true);
      return;
    }

    if (!options.confirmDuplicate) {
      const duplicateResults = await collectDuplicateWarnings(
        `${locationForm.name} ${locationForm.phone} ${locationForm.addressLine1} ${locationForm.city}`,
        'location'
      );

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
        alternateBillToCustomerIds: locationForm.alternateBillToCustomerIds,
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
        alternateBillToCustomerIds: [...selectedLocation.alternateBillToCustomerIds],
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
      onErrorMessage(error instanceof Error ? error.message : 'Unable to reassign location ownership.');
    }
  }

  async function handleCreateContactAndMaybeLink() {
    try {
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
      } else {
        setSelectedContact(createdContact);
        hydrateContactForm(createdContact);
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
      onErrorMessage(error instanceof Error ? error.message : 'Unable to save shared contact.');
    }
  }

  async function handleLinkExistingContact() {
    if (!existingContactId || (!selectedCustomer && !selectedLocation)) {
      return;
    }

    try {
      await linkOfficeContact({
        sessionToken,
        apiBaseUrl,
        contactId: existingContactId,
        customerId: selectedCustomer?.id,
        locationId: selectedLocation?.id
      });
      await reloadSelectedRecord();
      await refreshWorkspace();
    } catch (error) {
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
      const customer = await getOfficeCustomerDetail({ sessionToken, apiBaseUrl, customerId: selectedCustomer.id });
      setSelectedCustomer(customer);
      hydrateLinkDrafts(customer.contacts);
      return;
    }

    if (selectedLocation) {
      const location = await getOfficeLocationDetail({ sessionToken, apiBaseUrl, locationId: selectedLocation.id });
      setSelectedLocation(location);
      hydrateLinkDrafts(location.contacts);
      return;
    }

    if (selectedContact) {
      const contact = await getOfficeContactDetail({ sessionToken, apiBaseUrl, contactId: selectedContact.id });
      setSelectedContact(contact);
    }
  }

  async function collectDuplicateWarnings(query: string, kind: 'customer' | 'location') {
    if (!query.trim()) {
      return [];
    }

    const response = await searchOfficeCrm({ sessionToken, apiBaseUrl, query });
    return response.results
      .filter((result) => result.kind === kind)
      .map((result) => ({
        id: result.id,
        kind,
        title: result.title,
        subtitle: result.subtitle,
        matchReasons: ['Likely duplicate based on search'],
        isActive: result.isActive,
        hasDoNotServiceFlag: result.badges.includes('DNU')
      }));
  }

  function hydrateCustomerForm(customer: CustomerDetail) {
    setSelectedCustomer(customer);
    hydrateLinkDrafts(customer.contacts);
  }

  function hydrateLocationForm(location: LocationDetail) {
    setSelectedLocation(location);
  }

  function hydrateContactForm(contact: ContactDetail) {
    setSelectedContact(contact);
  }

  function hydrateLinkDrafts(links: ContactLink[]) {
    setLinkDrafts(
      Object.fromEntries(
        links.map((link) => [
          link.id,
          {
            phone: link.phone ?? '',
            email: link.email ?? '',
            fax: link.fax ?? '',
            tags: link.tags.join(', '),
            scope: 'link' as ContactUpdateScope
          }
        ])
      )
    );
  }

  const activeCustomerOptions = workspace?.customers ?? [];
  const activeContactOptions = workspace?.contacts ?? [];

  return (
    <section style={styles.card}>
      <div style={styles.row}>
        <div>
          <h2 style={styles.heading}>CRM backbone</h2>
          <p style={styles.muted}>
            Customer, location, and contact records now live in a real office workflow instead of only showing up
            through jobs and equipment.
          </p>
        </div>
        <button type="button" onClick={() => void refreshWorkspace()} style={styles.button}>
          {isRefreshing ? 'Refreshing...' : 'Refresh CRM'}
        </button>
      </div>

      <div style={styles.splitGrid}>
        <div style={styles.panel}>
          <h3 style={styles.subheading}>Search and select</h3>
          <div style={styles.formRow}>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, address, phone"
              style={styles.input}
            />
            <button type="button" onClick={() => void runSearch()} style={styles.primaryButton}>
              {isSearching ? 'Searching...' : 'Search CRM'}
            </button>
          </div>
          <div style={styles.list}>
            {searchResults.map((result) => (
              <button key={`${result.kind}-${result.id}`} type="button" onClick={() => void selectResult(result)} style={styles.cardButton}>
                <strong>
                  {result.title} {result.badges.includes('DNU') ? '(DNU)' : ''}
                </strong>
                <span style={styles.tinyMuted}>
                  {result.kind} - {result.subtitle}
                </span>
                {result.badges.length > 0 ? (
                  <span style={styles.badgeRow}>
                    {result.badges.map((badge: string) => (
                      <span key={badge} style={badge === 'DNU' ? styles.dangerBadge : styles.badge}>
                        {badge}
                      </span>
                    ))}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.subheading}>Create customer</h3>
          <div style={styles.formRow}>
            <input value={customerForm.name} onChange={(event) => { setCustomerForm((current) => ({ ...current, name: event.target.value })); setCustomerDuplicateWarnings([]); }} placeholder="Customer name" style={styles.input} />
            <select value={customerForm.accountType} onChange={(event) => setCustomerForm((current) => ({ ...current, accountType: event.target.value }))} style={styles.input}>
              <option value="residential">Residential</option>
              <option value="company">Company</option>
              <option value="propertyManager">Property manager</option>
              <option value="landlord">Landlord</option>
            </select>
            <input value={customerForm.billingAddressLine1} onChange={(event) => { setCustomerForm((current) => ({ ...current, billingAddressLine1: event.target.value })); setCustomerDuplicateWarnings([]); }} placeholder="Billing address" style={styles.input} />
            <input value={customerForm.billingCity} onChange={(event) => setCustomerForm((current) => ({ ...current, billingCity: event.target.value }))} placeholder="City" style={styles.input} />
            <input value={customerForm.billingState} onChange={(event) => setCustomerForm((current) => ({ ...current, billingState: event.target.value }))} placeholder="State" style={styles.input} />
            <input value={customerForm.billingPostalCode} onChange={(event) => setCustomerForm((current) => ({ ...current, billingPostalCode: event.target.value }))} placeholder="Postal code" style={styles.input} />
            <input value={customerForm.phone} onChange={(event) => setCustomerForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" style={styles.input} />
            <input value={customerForm.email} onChange={(event) => setCustomerForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={styles.input} />
            <input value={customerForm.fax} onChange={(event) => setCustomerForm((current) => ({ ...current, fax: event.target.value }))} placeholder="Fax" style={styles.input} />
            <input value={customerForm.flags} onChange={(event) => setCustomerForm((current) => ({ ...current, flags: event.target.value }))} placeholder="Flags (comma separated)" style={styles.input} />
          </div>
          {customerDuplicateWarnings.length > 0 ? (
            <div style={styles.subpanel}>
              <strong>Possible duplicate customer</strong>
              {customerDuplicateWarnings.map((warning) => (
                <div key={warning.id} style={styles.tinyMuted}>
                  {warning.title} - {warning.subtitle}
                </div>
              ))}
              <div style={styles.row}>
                <button type="button" onClick={() => void handleCreateCustomer(true)} style={styles.primaryButton}>
                  Create anyway
                </button>
                <button type="button" onClick={() => setCustomerDuplicateWarnings([])} style={styles.button}>
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}
          <button type="button" onClick={() => void handleCreateCustomer()} style={styles.primaryButton}>
            Create customer
          </button>
        </div>
      </div>

      <div style={styles.splitGrid}>
        <div style={styles.panel}>
          <h3 style={styles.subheading}>Create location</h3>
          <div style={styles.formRow}>
            <select value={locationForm.customerId} onChange={(event) => setLocationForm((current) => ({ ...current, customerId: event.target.value }))} style={styles.input}>
              {activeCustomerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
            <input value={locationForm.name} onChange={(event) => { setLocationForm((current) => ({ ...current, name: event.target.value })); setLocationDuplicateWarnings([]); }} placeholder="Location name" style={styles.input} />
            <input value={locationForm.addressLine1} onChange={(event) => { setLocationForm((current) => ({ ...current, addressLine1: event.target.value })); setLocationDuplicateWarnings([]); }} placeholder="Service address" style={styles.input} />
            <input value={locationForm.city} onChange={(event) => setLocationForm((current) => ({ ...current, city: event.target.value }))} placeholder="City" style={styles.input} />
            <input value={locationForm.state} onChange={(event) => setLocationForm((current) => ({ ...current, state: event.target.value }))} placeholder="State" style={styles.input} />
            <input value={locationForm.postalCode} onChange={(event) => setLocationForm((current) => ({ ...current, postalCode: event.target.value }))} placeholder="Postal code" style={styles.input} />
            <input value={locationForm.phone} onChange={(event) => setLocationForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" style={styles.input} />
            <input value={locationForm.email} onChange={(event) => setLocationForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={styles.input} />
            <input value={locationForm.fax} onChange={(event) => setLocationForm((current) => ({ ...current, fax: event.target.value }))} placeholder="Fax" style={styles.input} />
          </div>
          <label style={styles.inlineLabel}>
            <span>Alternate bill-to customers</span>
            <select
              multiple
              value={locationForm.alternateBillToCustomerIds}
              onChange={(event) =>
                setLocationForm((current) => ({
                  ...current,
                  alternateBillToCustomerIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                }))
              }
              style={styles.input}
            >
              {activeCustomerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          {locationDuplicateWarnings.length > 0 ? (
            <div style={styles.subpanel}>
              <strong>Possible duplicate location</strong>
              {locationDuplicateWarnings.map((warning) => (
                <div key={warning.id} style={styles.tinyMuted}>
                  {warning.title} - {warning.subtitle}
                </div>
              ))}
              <div style={styles.row}>
                <button
                  type="button"
                  onClick={() => void handleCreateLocation({ confirmDuplicate: true })}
                  style={styles.primaryButton}
                >
                  Create anyway
                </button>
                <button type="button" onClick={() => setLocationDuplicateWarnings([])} style={styles.button}>
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}
          {createLocationMissingContactConfirmation ? (
            <div style={styles.subpanel}>
              <strong>Location has no phone or email</strong>
              <div style={styles.tinyMuted}>Confirm this is intentional before saving this location.</div>
              <div style={styles.row}>
                <button
                  type="button"
                  onClick={() => void handleCreateLocation({ confirmMissingContactInfo: true })}
                  style={styles.primaryButton}
                >
                  Create without phone or email
                </button>
                <button
                  type="button"
                  onClick={() => setCreateLocationMissingContactConfirmation(false)}
                  style={styles.button}
                >
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}
          <button type="button" onClick={() => void handleCreateLocation()} style={styles.primaryButton}>
            Create location
          </button>
        </div>

        <div style={styles.panel}>
          <h3 style={styles.subheading}>Create shared contact</h3>
          <div style={styles.formRow}>
            <input value={contactForm.displayName} onChange={(event) => setContactForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="Display name" style={styles.input} />
            <input value={contactForm.phone} onChange={(event) => setContactForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" style={styles.input} />
            <input value={contactForm.email} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} placeholder="Email" style={styles.input} />
            <input value={contactForm.fax} onChange={(event) => setContactForm((current) => ({ ...current, fax: event.target.value }))} placeholder="Fax" style={styles.input} />
            <input value={contactForm.tags} onChange={(event) => setContactForm((current) => ({ ...current, tags: event.target.value }))} placeholder="Tags (comma separated)" style={styles.input} />
          </div>
          <button type="button" onClick={() => void handleCreateContactAndMaybeLink()} style={styles.primaryButton}>
            {selectedCustomer || selectedLocation ? 'Create and link contact' : 'Create contact'}
          </button>
        </div>
      </div>

      {(selectedCustomer || selectedLocation || selectedContact) ? (
        <div style={styles.panel}>
          <h3 style={styles.subheading}>Selected detail</h3>
          {selectedCustomer ? (
            <div style={styles.list}>
              <div style={styles.row}>
                <div>
                  <strong>{selectedCustomer.name}</strong>
                  <div style={styles.badgeRow}>
                    {!selectedCustomer.isActive ? <span style={styles.badge}>Inactive</span> : null}
                    {selectedCustomer.flags.some((flag) => flag.toLowerCase().includes('do not service')) ? (
                      <span style={styles.dangerBadge}>DNU</span>
                    ) : null}
                  </div>
                </div>
                <button type="button" onClick={() => void handleSaveCustomer()} style={styles.primaryButton}>
                  Save customer
                </button>
              </div>
              <div style={styles.formRow}>
                <input value={selectedCustomer.name} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, name: event.target.value } : current)} style={styles.input} />
                <select value={selectedCustomer.accountType} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, accountType: event.target.value } : current)} style={styles.input}>
                  <option value="residential">Residential</option>
                  <option value="company">Company</option>
                  <option value="propertyManager">Property manager</option>
                  <option value="landlord">Landlord</option>
                </select>
                <input value={selectedCustomer.billingAddressLine1} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, billingAddressLine1: event.target.value } : current)} style={styles.input} />
                <input value={selectedCustomer.billingCity} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, billingCity: event.target.value } : current)} style={styles.input} />
                <input value={selectedCustomer.billingState} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, billingState: event.target.value } : current)} style={styles.input} />
                <input value={selectedCustomer.billingPostalCode} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, billingPostalCode: event.target.value } : current)} style={styles.input} />
                <input value={selectedCustomer.phone ?? ''} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, phone: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedCustomer.email ?? ''} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, email: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedCustomer.fax ?? ''} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, fax: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedCustomer.flags.join(', ')} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, flags: splitCommaValues(event.target.value) } : current)} style={styles.input} />
              </div>
              <label style={styles.inlineLabel}>
                <input type="checkbox" checked={selectedCustomer.isActive} onChange={(event) => setSelectedCustomer((current) => current ? { ...current, isActive: event.target.checked } : current)} />
                Customer is active
              </label>
              <RecordContactsSection
                title="Customer contacts"
                contacts={selectedCustomer.contacts}
                activeContactOptions={activeContactOptions}
                existingContactId={existingContactId}
                setExistingContactId={setExistingContactId}
                linkDrafts={linkDrafts}
                setLinkDrafts={setLinkDrafts}
                onLinkExisting={() => void handleLinkExistingContact()}
                onSaveLink={(link) => void handleSaveContactLink(link)}
                onEndDateLink={(linkId) => void handleEndDateContactLink(linkId)}
                onArchiveLink={(linkId, isActive) => void handleArchiveContactLink(linkId, isActive)}
              />
            </div>
          ) : null}

          {selectedLocation ? (
            <div style={styles.list}>
              <div style={styles.row}>
                <div>
                  <strong>{selectedLocation.name}</strong>
                  <div style={styles.tinyMuted}>
                    {selectedLocation.customerName} - {selectedLocation.addressLine1}, {selectedLocation.city}
                  </div>
                </div>
                <button type="button" onClick={() => void handleSaveLocation()} style={styles.primaryButton}>
                  Save location
                </button>
              </div>
              <div style={styles.formRow}>
                <input value={selectedLocation.name} onChange={(event) => setSelectedLocation((current) => current ? { ...current, name: event.target.value } : current)} style={styles.input} />
                <input value={selectedLocation.addressLine1} onChange={(event) => setSelectedLocation((current) => current ? { ...current, addressLine1: event.target.value } : current)} style={styles.input} />
                <input value={selectedLocation.city} onChange={(event) => setSelectedLocation((current) => current ? { ...current, city: event.target.value } : current)} style={styles.input} />
                <input value={selectedLocation.state} onChange={(event) => setSelectedLocation((current) => current ? { ...current, state: event.target.value } : current)} style={styles.input} />
                <input value={selectedLocation.postalCode} onChange={(event) => setSelectedLocation((current) => current ? { ...current, postalCode: event.target.value } : current)} style={styles.input} />
                <input value={selectedLocation.phone ?? ''} onChange={(event) => setSelectedLocation((current) => current ? { ...current, phone: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedLocation.email ?? ''} onChange={(event) => setSelectedLocation((current) => current ? { ...current, email: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedLocation.fax ?? ''} onChange={(event) => setSelectedLocation((current) => current ? { ...current, fax: event.target.value || undefined } : current)} style={styles.input} />
              </div>
              {saveLocationMissingContactConfirmation ? (
                <div style={styles.subpanel}>
                  <strong>Location has no phone or email</strong>
                  <div style={styles.tinyMuted}>Confirm this is intentional before saving this location.</div>
                  <div style={styles.row}>
                    <button type="button" onClick={() => void handleSaveLocation()} style={styles.primaryButton}>
                      Save without phone or email
                    </button>
                    <button
                      type="button"
                      onClick={() => setSaveLocationMissingContactConfirmation(false)}
                      style={styles.button}
                    >
                      Keep editing
                    </button>
                  </div>
                </div>
              ) : null}
              <label style={styles.inlineLabel}>
                <input type="checkbox" checked={selectedLocation.isActive} onChange={(event) => setSelectedLocation((current) => current ? { ...current, isActive: event.target.checked } : current)} />
                Location is active
              </label>
              <label style={styles.inlineLabel}>
                <span>Alternate bill-to customers</span>
                <select
                  multiple
                  value={selectedLocation.alternateBillToCustomerIds}
                  onChange={(event) =>
                    setSelectedLocation((current) =>
                      current
                        ? {
                            ...current,
                            alternateBillToCustomerIds: Array.from(event.target.selectedOptions).map((option) => option.value)
                          }
                        : current
                    )
                  }
                  style={styles.input}
                >
                  {activeCustomerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <div style={styles.subpanel}>
                <strong>Reassign owner</strong>
                <div style={styles.formRow}>
                  <select value={reassignCustomerId} onChange={(event) => setReassignCustomerId(event.target.value)} style={styles.input}>
                    {activeCustomerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  <input value={reassignNote} onChange={(event) => setReassignNote(event.target.value)} placeholder="Reason or note" style={styles.input} />
                  <button type="button" onClick={() => void handleReassignLocation()} style={styles.button}>
                    Reassign owner
                  </button>
                </div>
              </div>
              <div style={styles.subpanel}>
                <strong>Ownership history</strong>
                {selectedLocation.ownershipHistory.map((entry) => (
                  <div key={entry.id} style={styles.tinyMuted}>
                    {entry.customerName}: {entry.startedAt.slice(0, 10)}
                    {entry.endedAt ? ` to ${entry.endedAt.slice(0, 10)}` : ' to present'}
                    {entry.note ? ` - ${entry.note}` : ''}
                  </div>
                ))}
              </div>
              <RecordContactsSection
                title="Location contacts"
                contacts={selectedLocation.contacts}
                activeContactOptions={activeContactOptions}
                existingContactId={existingContactId}
                setExistingContactId={setExistingContactId}
                linkDrafts={linkDrafts}
                setLinkDrafts={setLinkDrafts}
                onLinkExisting={() => void handleLinkExistingContact()}
                onSaveLink={(link) => void handleSaveContactLink(link)}
                onEndDateLink={(linkId) => void handleEndDateContactLink(linkId)}
                onArchiveLink={(linkId, isActive) => void handleArchiveContactLink(linkId, isActive)}
              />
            </div>
          ) : null}

          {selectedContact ? (
            <div style={styles.list}>
              <div style={styles.row}>
                <div>
                  <strong>{selectedContact.displayName}</strong>
                  {!selectedContact.isActive ? <span style={styles.badge}>Inactive</span> : null}
                </div>
                <button type="button" onClick={() => void handleSaveSharedContact()} style={styles.primaryButton}>
                  Save shared contact
                </button>
              </div>
              <div style={styles.formRow}>
                <input value={selectedContact.displayName} onChange={(event) => setSelectedContact((current) => current ? { ...current, displayName: event.target.value } : current)} style={styles.input} />
                <input value={selectedContact.phone ?? ''} onChange={(event) => setSelectedContact((current) => current ? { ...current, phone: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedContact.email ?? ''} onChange={(event) => setSelectedContact((current) => current ? { ...current, email: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedContact.fax ?? ''} onChange={(event) => setSelectedContact((current) => current ? { ...current, fax: event.target.value || undefined } : current)} style={styles.input} />
                <input value={selectedContact.tags.join(', ')} onChange={(event) => setSelectedContact((current) => current ? { ...current, tags: splitCommaValues(event.target.value) } : current)} style={styles.input} />
              </div>
              <div style={styles.subpanel}>
                <strong>Linked records</strong>
                {selectedContact.linkedRecords.map((link) => (
                  <div key={link.id} style={styles.tinyMuted}>
                    {link.linkedRecord.kind}: {link.linkedRecord.name} - {link.linkedRecord.subtitle}
                    {link.endDate ? ` (end-dated ${link.endDate})` : ''}
                    {!link.isActive ? ' (inactive)' : ''}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type RecordContactsSectionProps = {
  title: string;
  contacts: ContactLink[];
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  existingContactId: string;
  setExistingContactId: (value: string) => void;
  linkDrafts: Record<string, ContactLinkDraft>;
  setLinkDrafts: Dispatch<SetStateAction<Record<string, ContactLinkDraft>>>;
  onLinkExisting: () => void;
  onSaveLink: (link: ContactLink) => void;
  onEndDateLink: (linkId: string) => void;
  onArchiveLink: (linkId: string, isActive: boolean) => void;
};

function RecordContactsSection({
  title,
  contacts,
  activeContactOptions,
  existingContactId,
  setExistingContactId,
  linkDrafts,
  setLinkDrafts,
  onLinkExisting,
  onSaveLink,
  onEndDateLink,
  onArchiveLink
}: RecordContactsSectionProps) {
  return (
    <div style={styles.subpanel}>
      <strong>{title}</strong>
      <div style={styles.formRow}>
        <select value={existingContactId} onChange={(event) => setExistingContactId(event.target.value)} style={styles.input}>
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
                  {contact.endDate ? `End-dated ${contact.endDate}` : contact.isActive ? 'Active link' : 'Inactive link'}
                </div>
              </div>
              <select
                value={draft.scope}
                onChange={(event) =>
                  setLinkDrafts((current) => ({
                    ...current,
                    [contact.id]: {
                      ...draft,
                      scope: event.target.value as ContactUpdateScope
                    }
                  }))
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
                  setLinkDrafts((current) => ({
                    ...current,
                    [contact.id]: { ...draft, phone: event.target.value }
                  }))
                }
                placeholder="Phone"
                style={styles.input}
              />
              <input
                value={draft.email}
                onChange={(event) =>
                  setLinkDrafts((current) => ({
                    ...current,
                    [contact.id]: { ...draft, email: event.target.value }
                  }))
                }
                placeholder="Email"
                style={styles.input}
              />
              <input
                value={draft.fax}
                onChange={(event) =>
                  setLinkDrafts((current) => ({
                    ...current,
                    [contact.id]: { ...draft, fax: event.target.value }
                  }))
                }
                placeholder="Fax"
                style={styles.input}
              />
              <input
                value={draft.tags}
                onChange={(event) =>
                  setLinkDrafts((current) => ({
                    ...current,
                    [contact.id]: { ...draft, tags: event.target.value }
                  }))
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
              <button type="button" onClick={() => onArchiveLink(contact.id, !contact.isActive)} style={styles.button}>
                {contact.isActive ? 'Archive link' : 'Reactivate link'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function createEmptyCustomerForm(): CustomerFormState {
  return {
    name: '',
    accountType: 'residential',
    billingAddressLine1: '',
    billingCity: '',
    billingState: '',
    billingPostalCode: '',
    phone: '',
    email: '',
    fax: '',
    flags: ''
  };
}

function createEmptyLocationForm(customerId = ''): LocationFormState {
  return {
    customerId,
    name: '',
    addressLine1: '',
    city: '',
    state: '',
    postalCode: '',
    phone: '',
    email: '',
    fax: '',
    alternateBillToCustomerIds: []
  };
}

function createEmptyContactForm(): ContactFormState {
  return {
    displayName: '',
    phone: '',
    email: '',
    fax: '',
    tags: ''
  };
}

function locationNeedsPhoneEmailConfirmation(phone: string | undefined, email: string | undefined): boolean {
  return !phone?.trim() && !email?.trim();
}

function splitCommaValues(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
