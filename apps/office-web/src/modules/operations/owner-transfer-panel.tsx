'use client';

import { useState } from 'react';
import type {
  CrmSearchResult,
  CustomerDetail,
  DuplicateCandidate,
  LocationDetail
} from '@/lib/operations-api';
import {
  createOfficeCustomer,
  reassignOfficeLocationOwner,
  searchOfficeCrm
} from '@/lib/operations-api';
import {
  collectCrmDuplicateWarnings,
  createEmptyCustomerForm,
  splitCommaValues
} from './crm-form-helpers';
import type { CustomerFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type OwnerTransferPanelProps = {
  apiBaseUrl: string;
  location: LocationDetail;
  sessionToken: string;
  onOpenCustomer: (customerId: string) => void;
  onTransferred: (location: LocationDetail) => Promise<void> | void;
};

type OwnerCandidate = {
  id: string;
  name: string;
  subtitle?: string;
  isActive: boolean;
};

export function OwnerTransferPanel({
  apiBaseUrl,
  location,
  sessionToken,
  onOpenCustomer,
  onTransferred
}: OwnerTransferPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<OwnerCandidate[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<OwnerCandidate | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerFormState>(createEmptyCustomerForm());
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateCandidate[]>([]);
  const [effectiveDate, setEffectiveDate] = useState(todayDateString());
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSearch() {
    const query = searchQuery.trim();
    setErrorMessage(null);

    if (query.length < 2) {
      setSearchResults([]);
      setErrorMessage('Type at least 2 characters to search customers.');
      return;
    }

    setIsSearching(true);

    try {
      const response = await searchOfficeCrm({ sessionToken, apiBaseUrl, query });
      setSearchResults(response.results.filter(isCustomerResult).map(toOwnerCandidate));
    } catch (error) {
      setSearchResults([]);
      setErrorMessage(error instanceof Error ? error.message : 'Unable to search customers.');
    } finally {
      setIsSearching(false);
    }
  }

  async function handleCreateCustomer(forceConfirm = false) {
    setErrorMessage(null);

    if (!forceConfirm) {
      const warnings = await collectCrmDuplicateWarnings({
        sessionToken,
        apiBaseUrl,
        query: `${customerForm.name} ${customerForm.phone} ${customerForm.billingAddressLine1} ${customerForm.billingCity}`,
        kind: 'customer'
      });

      if (warnings.length > 0) {
        setDuplicateWarnings(warnings);
        return;
      }
    }

    setIsSaving(true);

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
        confirmDuplicate: forceConfirm || duplicateWarnings.length > 0
      });
      setDuplicateWarnings([]);
      setCustomerForm(createEmptyCustomerForm());
      setIsCreatingCustomer(false);
      setSelectedCustomer(customerDetailToOwnerCandidate(response.customer));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create customer.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransferOwnership() {
    if (!selectedCustomer) {
      setErrorMessage('Select a customer before transferring ownership.');
      return;
    }

    if (!effectiveDate) {
      setErrorMessage('Effective date is required.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await reassignOfficeLocationOwner({
        sessionToken,
        apiBaseUrl,
        locationId: location.id,
        customerId: selectedCustomer.id,
        effectiveDate,
        note: note.trim() || undefined
      });
      await onTransferred(response.location);
      setIsOpen(false);
      setSelectedCustomer(null);
      setSearchQuery('');
      setSearchResults([]);
      setNote('');
      setEffectiveDate(todayDateString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to transfer location ownership.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <div style={styles.subpanel}>
        <div style={styles.row}>
          <div>
            <strong>Current customer</strong>
            <div style={styles.tinyMuted}>{location.customerName}</div>
          </div>
          <div style={styles.inlineActionBar}>
            <button
              type="button"
              onClick={() => onOpenCustomer(location.customerId)}
              style={styles.button}
            >
              Open customer
            </button>
            <button type="button" onClick={() => setIsOpen(true)} style={styles.button}>
              Transfer ownership
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <div>
          <strong>Transfer ownership</strong>
          <div style={styles.tinyMuted}>Current customer: {location.customerName}</div>
        </div>
        <button type="button" onClick={() => setIsOpen(false)} style={styles.button}>
          Cancel
        </button>
      </div>
      {errorMessage ? <p style={styles.error}>{errorMessage}</p> : null}
      <div style={styles.formRow}>
        <label style={styles.fieldLabel}>
          <span>Search customers</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Name, phone, or address"
            style={styles.input}
          />
        </label>
        <button type="button" onClick={() => void handleSearch()} style={styles.button}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsCreatingCustomer(true);
            setSelectedCustomer(null);
            setDuplicateWarnings([]);
          }}
          style={styles.button}
        >
          New customer
        </button>
      </div>
      {searchResults.length > 0 ? (
        <div style={styles.list}>
          {searchResults.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedCustomer(customer)}
              style={styles.cardButton}
              disabled={!customer.isActive || customer.id === location.customerId}
            >
              <strong>{customer.name}</strong>
              <span style={styles.tinyMuted}>
                {customer.id === location.customerId
                  ? 'Current owner'
                  : customer.isActive
                    ? customer.subtitle
                    : 'Inactive customer'}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {isCreatingCustomer ? (
        <div style={styles.panel}>
          <div style={styles.row}>
            <strong>New customer</strong>
            <button
              type="button"
              onClick={() => {
                setIsCreatingCustomer(false);
                setDuplicateWarnings([]);
              }}
              style={styles.button}
            >
              Close
            </button>
          </div>
          <div style={styles.formRow}>
            <input
              value={customerForm.name}
              onChange={(event) => {
                setCustomerForm((current) => ({ ...current, name: event.target.value }));
                setDuplicateWarnings([]);
              }}
              placeholder="Customer name"
              style={styles.input}
            />
            <select
              value={customerForm.accountType}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  accountType: event.target.value
                }))
              }
              style={styles.input}
            >
              <option value="residential">Residential</option>
              <option value="company">Company</option>
              <option value="propertyManager">Property manager</option>
              <option value="landlord">Landlord</option>
            </select>
            <input
              value={customerForm.billingAddressLine1}
              onChange={(event) => {
                setCustomerForm((current) => ({
                  ...current,
                  billingAddressLine1: event.target.value
                }));
                setDuplicateWarnings([]);
              }}
              placeholder="Billing address"
              style={styles.input}
            />
            <input
              value={customerForm.billingCity}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  billingCity: event.target.value
                }))
              }
              placeholder="City"
              style={styles.input}
            />
            <input
              value={customerForm.billingState}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  billingState: event.target.value
                }))
              }
              placeholder="State"
              style={styles.input}
            />
            <input
              value={customerForm.billingPostalCode}
              onChange={(event) =>
                setCustomerForm((current) => ({
                  ...current,
                  billingPostalCode: event.target.value
                }))
              }
              placeholder="Postal code"
              style={styles.input}
            />
            <input
              value={customerForm.phone}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, phone: event.target.value }))
              }
              placeholder="Phone"
              style={styles.input}
            />
            <input
              value={customerForm.email}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, email: event.target.value }))
              }
              placeholder="Email"
              style={styles.input}
            />
          </div>
          {duplicateWarnings.length > 0 ? (
            <div style={styles.subpanel}>
              <strong>Possible duplicate customer</strong>
              {duplicateWarnings.map((warning) => (
                <div key={warning.id} style={styles.tinyMuted}>
                  {warning.title} - {warning.subtitle}
                </div>
              ))}
              <div style={styles.row}>
                <button
                  type="button"
                  onClick={() => void handleCreateCustomer(true)}
                  style={styles.primaryButton}
                  disabled={isSaving}
                >
                  Create anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWarnings([])}
                  style={styles.button}
                >
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void handleCreateCustomer()}
            style={styles.button}
            disabled={isSaving}
          >
            Create and select customer
          </button>
        </div>
      ) : null}
      <div style={styles.formRow}>
        <label style={styles.fieldLabel}>
          <span>Effective date</span>
          <input
            type="date"
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
            style={styles.input}
          />
        </label>
        <label style={styles.fieldLabel}>
          <span>Note</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Reason or note"
            style={styles.input}
          />
        </label>
      </div>
      <div style={styles.subpanel}>
        <strong>Review transfer</strong>
        <div style={styles.tinyMuted}>
          {selectedCustomer
            ? `${location.name} will transfer from ${location.customerName} to ${selectedCustomer.name} effective ${effectiveDate || 'date not set'}.`
            : 'Select a customer to review the transfer.'}
        </div>
        <button
          type="button"
          onClick={() => void handleTransferOwnership()}
          style={styles.primaryButton}
          disabled={!selectedCustomer || !effectiveDate || isSaving}
        >
          Confirm transfer
        </button>
      </div>
    </div>
  );
}

function isCustomerResult(result: CrmSearchResult): boolean {
  return result.kind === 'customer';
}

function toOwnerCandidate(result: CrmSearchResult): OwnerCandidate {
  return {
    id: result.id,
    name: result.title,
    subtitle: result.subtitle,
    isActive: result.isActive
  };
}

function customerDetailToOwnerCandidate(customer: CustomerDetail): OwnerCandidate {
  return {
    id: customer.id,
    name: customer.name,
    subtitle: `${customer.billingAddressLine1}, ${customer.billingCity}`,
    isActive: customer.isActive
  };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}
