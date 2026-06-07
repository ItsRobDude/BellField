'use client';

import type { ContactLink, CrmWorkspaceResponse, CustomerDetail } from '@/lib/operations-api';
import { ContactMethodsEditor } from './contact-methods-editor';
import { CrmCustomerLocationsSection } from './crm-customer-locations-section';
import { splitCommaValues } from './crm-form-helpers';
import {
  CrmActivitySection,
  CrmInvoicesSection,
  CrmJobsSection,
  CrmOperationalOverview
} from './crm-operational-sections';
import type { ContactLinkDraft, CustomerDetailTab } from './crm-panel-types';
import { RecordContactsSection } from './crm-record-contacts-section';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CustomerDetailSurfaceProps = {
  activeContactOptions: CrmWorkspaceResponse['contacts'];
  apiBaseUrl: string;
  customer: CustomerDetail;
  existingContactId: string;
  linkDrafts: Record<string, ContactLinkDraft>;
  selectedCustomerTab: CustomerDetailTab;
  sessionToken: string;
  onAddLocation: () => void;
  onArchiveLink: (linkId: string, isActive: boolean) => void;
  onChangeCustomer: (customer: CustomerDetail) => void;
  onEndDateLink: (linkId: string) => void;
  onLinkDraftChange: (contactId: string, draft: ContactLinkDraft) => void;
  onLinkExisting: () => void;
  onOpenLocation: (locationId: string) => void;
  onRefreshSelectedRecord: () => Promise<void> | void;
  onSaveCustomer: () => void;
  onSaveLink: (link: ContactLink) => void;
  onSelectedCustomerTabChange: (tab: CustomerDetailTab) => void;
  setExistingContactId: (contactId: string) => void;
};

const customerDetailTabs: Array<{ key: CustomerDetailTab; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'locations', label: 'Locations' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'activity', label: 'Activity' }
];

export function CustomerDetailSurface({
  activeContactOptions,
  apiBaseUrl,
  customer,
  existingContactId,
  linkDrafts,
  selectedCustomerTab,
  sessionToken,
  onAddLocation,
  onArchiveLink,
  onChangeCustomer,
  onEndDateLink,
  onLinkDraftChange,
  onLinkExisting,
  onOpenLocation,
  onRefreshSelectedRecord,
  onSaveCustomer,
  onSaveLink,
  onSelectedCustomerTabChange,
  setExistingContactId
}: CustomerDetailSurfaceProps) {
  return (
    <div style={styles.list}>
      <div style={styles.row}>
        <div>
          <strong>{customer.name}</strong>
          <div style={styles.badgeRow}>
            {!customer.isActive ? <span style={styles.badge}>Inactive</span> : null}
            {customer.flags.some((flag) => flag.toLowerCase().includes('do not service')) ? (
              <span style={styles.dangerBadge}>DNU</span>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={onSaveCustomer} style={styles.primaryButton}>
          Save customer
        </button>
      </div>
      <div style={styles.tabList} role="tablist" aria-label="Customer sections">
        {customerDetailTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selectedCustomerTab === tab.key}
            onClick={() => onSelectedCustomerTabChange(tab.key)}
            style={selectedCustomerTab === tab.key ? styles.activeTabButton : styles.tabButton}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {selectedCustomerTab === 'overview' ? (
        <>
          <CrmOperationalOverview
            operational={customer.operational}
            contactMethods={customer.contactMethods}
          />
          <div style={styles.formRow}>
            <input
              value={customer.name}
              onChange={(event) => onChangeCustomer({ ...customer, name: event.target.value })}
              style={styles.input}
            />
            <select
              value={customer.accountType}
              onChange={(event) =>
                onChangeCustomer({ ...customer, accountType: event.target.value })
              }
              style={styles.input}
            >
              <option value="residential">Residential</option>
              <option value="company">Company</option>
              <option value="propertyManager">Property manager</option>
              <option value="landlord">Landlord</option>
            </select>
            <input
              value={customer.billingAddressLine1}
              onChange={(event) =>
                onChangeCustomer({ ...customer, billingAddressLine1: event.target.value })
              }
              style={styles.input}
            />
            <input
              value={customer.billingCity}
              onChange={(event) =>
                onChangeCustomer({ ...customer, billingCity: event.target.value })
              }
              style={styles.input}
            />
            <input
              value={customer.billingState}
              onChange={(event) =>
                onChangeCustomer({ ...customer, billingState: event.target.value })
              }
              style={styles.input}
            />
            <input
              value={customer.billingPostalCode}
              onChange={(event) =>
                onChangeCustomer({ ...customer, billingPostalCode: event.target.value })
              }
              style={styles.input}
            />
            <input
              value={customer.phone ?? ''}
              onChange={(event) =>
                onChangeCustomer({ ...customer, phone: event.target.value || undefined })
              }
              style={styles.input}
            />
            <input
              value={customer.email ?? ''}
              onChange={(event) =>
                onChangeCustomer({ ...customer, email: event.target.value || undefined })
              }
              style={styles.input}
            />
            <input
              value={customer.fax ?? ''}
              onChange={(event) =>
                onChangeCustomer({ ...customer, fax: event.target.value || undefined })
              }
              style={styles.input}
            />
            <input
              value={customer.flags.join(', ')}
              onChange={(event) =>
                onChangeCustomer({ ...customer, flags: splitCommaValues(event.target.value) })
              }
              style={styles.input}
            />
          </div>
          <label style={styles.inlineLabel}>
            <input
              type="checkbox"
              checked={customer.isActive}
              onChange={(event) =>
                onChangeCustomer({ ...customer, isActive: event.target.checked })
              }
            />
            Customer is active
          </label>
          <ContactMethodsEditor
            apiBaseUrl={apiBaseUrl}
            sessionToken={sessionToken}
            ownerKind="customer"
            ownerId={customer.id}
            contactMethods={customer.contactMethods}
            onSaved={onRefreshSelectedRecord}
          />
        </>
      ) : null}
      {selectedCustomerTab === 'locations' ? (
        <CrmCustomerLocationsSection
          locations={customer.locations}
          onAddLocation={onAddLocation}
          onOpenLocation={onOpenLocation}
        />
      ) : null}
      {selectedCustomerTab === 'contacts' ? (
        <RecordContactsSection
          title="Customer contacts"
          contacts={customer.contacts}
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
      {selectedCustomerTab === 'jobs' ? (
        <CrmJobsSection operational={customer.operational} />
      ) : null}
      {selectedCustomerTab === 'invoices' ? (
        <CrmInvoicesSection operational={customer.operational} />
      ) : null}
      {selectedCustomerTab === 'activity' ? (
        <CrmActivitySection activity={customer.operational.activity} />
      ) : null}
    </div>
  );
}
