'use client';

import type { CrmSearchResult, DuplicateCandidate } from '@/lib/operations-api';
import type { CustomerFormState, LocationFormState } from './crm-panel-types';
import type {
  JobIntakeCustomerLocationOption,
  JobIntakeSelectedCustomer
} from './job-intake-panel';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type IntakeMode = 'search' | 'newCustomer' | 'newLocation';

export function ServiceLocationStep({
  createMessage,
  customerDuplicateWarnings,
  customerForm,
  customerLocationMessage,
  customerLocationOptions,
  intakeMode,
  isCreatingCustomer,
  isCreatingLocation,
  isLocationSearchLoading,
  locationDuplicateWarnings,
  locationForm,
  locationMissingContactConfirmation,
  locationSearchQuery,
  locationSearchResults,
  selectedCustomer,
  onAddLocation,
  onCancelQuickCreate,
  onCustomerFormChange,
  onLocationFormChange,
  onLocationSearchQueryChange,
  onNewCustomer,
  onSelectCustomerLocation,
  onSelectLocationSearchResult,
  onSubmitCustomer,
  onSubmitCustomerAnyway,
  onSubmitLocation,
  onSubmitLocationAnyway,
  onSubmitLocationWithoutContact
}: {
  createMessage: string | null;
  customerDuplicateWarnings: DuplicateCandidate[];
  customerForm: CustomerFormState;
  customerLocationMessage: string | null;
  customerLocationOptions: JobIntakeCustomerLocationOption[];
  intakeMode: IntakeMode;
  isCreatingCustomer: boolean;
  isCreatingLocation: boolean;
  isLocationSearchLoading: boolean;
  locationDuplicateWarnings: DuplicateCandidate[];
  locationForm: LocationFormState;
  locationMissingContactConfirmation: boolean;
  locationSearchQuery: string;
  locationSearchResults: CrmSearchResult[];
  selectedCustomer: JobIntakeSelectedCustomer | null;
  onAddLocation: () => void;
  onCancelQuickCreate: () => void;
  onCustomerFormChange: (updater: (current: CustomerFormState) => CustomerFormState) => void;
  onLocationFormChange: (updater: (current: LocationFormState) => LocationFormState) => void;
  onLocationSearchQueryChange: (query: string) => void;
  onNewCustomer: () => void;
  onSelectCustomerLocation: (locationId: string) => void;
  onSelectLocationSearchResult: (result: CrmSearchResult) => void;
  onSubmitCustomer: () => void;
  onSubmitCustomerAnyway: () => void;
  onSubmitLocation: () => void;
  onSubmitLocationAnyway: () => void;
  onSubmitLocationWithoutContact: () => void;
}) {
  return (
    <div style={styles.formSection}>
      <div style={styles.row}>
        <h2 style={styles.sectionHeading}>Search for service location</h2>
        <button type="button" style={styles.button} onClick={onNewCustomer}>
          New customer
        </button>
      </div>
      <label style={styles.fieldLabel}>
        <span>Service location or customer</span>
        <input
          aria-label="Job location search"
          value={locationSearchQuery}
          onChange={(event) => onLocationSearchQueryChange(event.target.value)}
          placeholder="Search by customer, location, address, or phone"
          style={styles.input}
        />
      </label>
      {isLocationSearchLoading ? <p style={styles.tinyMuted}>Searching...</p> : null}
      {locationSearchResults.length > 0 ? (
        <div aria-label="Job location search results" role="group" style={styles.listCompact}>
          {locationSearchResults.map((result) => (
            <button
              key={`${result.kind}:${result.id}`}
              type="button"
              style={styles.cardButton}
              onClick={() => onSelectLocationSearchResult(result)}
            >
              <span style={styles.fieldText}>
                {result.kind === 'location' ? 'Location' : 'Customer'}
              </span>
              <strong>{result.title}</strong>
              <span style={styles.tinyMuted}>{result.subtitle}</span>
            </button>
          ))}
        </div>
      ) : null}
      {locationSearchQuery.trim().length >= 2 &&
      !isLocationSearchLoading &&
      locationSearchResults.length === 0 ? (
        <p style={styles.tinyMuted}>No matching service location or customer found.</p>
      ) : null}

      {selectedCustomer ? (
        <div aria-label="Selected intake customer" role="group" style={styles.subpanel}>
          <div style={styles.row}>
            <div>
              <p style={styles.sectionHeading}>{selectedCustomer.name}</p>
              <p style={styles.tinyMuted}>Choose an active service location or add one.</p>
            </div>
            <button type="button" style={styles.button} onClick={onAddLocation}>
              Add location
            </button>
          </div>
          {customerLocationOptions.length > 0 ? (
            <div aria-label="Customer locations" role="group" style={styles.listCompact}>
              {customerLocationOptions.map((location) => (
                <button
                  key={location.id}
                  type="button"
                  style={styles.cardButton}
                  onClick={() => onSelectCustomerLocation(location.id)}
                >
                  <strong>{location.name}</strong>
                  <span style={styles.tinyMuted}>{formatAddress(location)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {customerLocationMessage ? (
            <p style={styles.tinyMuted}>{customerLocationMessage}</p>
          ) : null}
        </div>
      ) : null}

      {createMessage ? <p style={styles.notice}>{createMessage}</p> : null}

      {intakeMode === 'newCustomer' ? (
        <CustomerQuickCreateForm
          duplicateWarnings={customerDuplicateWarnings}
          form={customerForm}
          isSubmitting={isCreatingCustomer}
          onCancel={onCancelQuickCreate}
          onChange={onCustomerFormChange}
          onSubmit={onSubmitCustomer}
          onSubmitAnyway={onSubmitCustomerAnyway}
        />
      ) : null}

      {intakeMode === 'newLocation' && selectedCustomer ? (
        <LocationQuickCreateForm
          duplicateWarnings={locationDuplicateWarnings}
          form={locationForm}
          isMissingContactConfirmationVisible={locationMissingContactConfirmation}
          isSubmitting={isCreatingLocation}
          selectedCustomer={selectedCustomer}
          onCancel={onCancelQuickCreate}
          onChange={onLocationFormChange}
          onSubmit={onSubmitLocation}
          onSubmitAnyway={onSubmitLocationAnyway}
          onSubmitWithoutContact={onSubmitLocationWithoutContact}
        />
      ) : null}
    </div>
  );
}

function CustomerQuickCreateForm({
  duplicateWarnings,
  form,
  isSubmitting,
  onCancel,
  onChange,
  onSubmit,
  onSubmitAnyway
}: {
  duplicateWarnings: DuplicateCandidate[];
  form: CustomerFormState;
  isSubmitting: boolean;
  onCancel: () => void;
  onChange: (updater: (current: CustomerFormState) => CustomerFormState) => void;
  onSubmit: () => void;
  onSubmitAnyway: () => void;
}) {
  return (
    <div aria-label="New customer" role="group" style={styles.subpanel}>
      <div style={styles.row}>
        <h3 style={styles.sectionHeading}>New customer</h3>
        <button type="button" style={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div style={styles.formGridCompact}>
        <TextInput
          label="Customer name"
          value={form.name}
          onChange={(value) => onChange((current) => ({ ...current, name: value }))}
        />
        <label style={styles.fieldLabel}>
          <span>Account type</span>
          <select
            value={form.accountType}
            onChange={(event) =>
              onChange((current) => ({ ...current, accountType: event.target.value }))
            }
            style={styles.input}
          >
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
            <option value="propertyManager">Property manager</option>
          </select>
        </label>
        <TextInput
          label="Billing street"
          value={form.billingAddressLine1}
          onChange={(value) => onChange((current) => ({ ...current, billingAddressLine1: value }))}
        />
        <TextInput
          label="Billing city"
          value={form.billingCity}
          onChange={(value) => onChange((current) => ({ ...current, billingCity: value }))}
        />
        <TextInput
          label="Billing state"
          value={form.billingState}
          onChange={(value) => onChange((current) => ({ ...current, billingState: value }))}
        />
        <TextInput
          label="Billing ZIP"
          value={form.billingPostalCode}
          onChange={(value) => onChange((current) => ({ ...current, billingPostalCode: value }))}
        />
        <TextInput
          label="Phone"
          value={form.phone}
          onChange={(value) => onChange((current) => ({ ...current, phone: value }))}
        />
        <TextInput
          label="Email"
          type="email"
          value={form.email}
          onChange={(value) => onChange((current) => ({ ...current, email: value }))}
        />
        <TextInput
          label="Fax"
          value={form.fax}
          onChange={(value) => onChange((current) => ({ ...current, fax: value }))}
        />
        <TextInput
          label="Flags"
          value={form.flags}
          onChange={(value) => onChange((current) => ({ ...current, flags: value }))}
        />
      </div>
      <DuplicateWarnings warnings={duplicateWarnings} />
      <div style={styles.inlineActionBar}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? 'Creating...' : 'Create customer'}
        </button>
        {duplicateWarnings.length > 0 ? (
          <button
            type="button"
            style={styles.button}
            disabled={isSubmitting}
            onClick={onSubmitAnyway}
          >
            Create customer anyway
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LocationQuickCreateForm({
  duplicateWarnings,
  form,
  isMissingContactConfirmationVisible,
  isSubmitting,
  selectedCustomer,
  onCancel,
  onChange,
  onSubmit,
  onSubmitAnyway,
  onSubmitWithoutContact
}: {
  duplicateWarnings: DuplicateCandidate[];
  form: LocationFormState;
  isMissingContactConfirmationVisible: boolean;
  isSubmitting: boolean;
  selectedCustomer: JobIntakeSelectedCustomer;
  onCancel: () => void;
  onChange: (updater: (current: LocationFormState) => LocationFormState) => void;
  onSubmit: () => void;
  onSubmitAnyway: () => void;
  onSubmitWithoutContact: () => void;
}) {
  return (
    <div aria-label="Add location" role="group" style={styles.subpanel}>
      <div style={styles.row}>
        <div>
          <h3 style={styles.sectionHeading}>Add location</h3>
          <p style={styles.tinyMuted}>Owner: {selectedCustomer.name}</p>
        </div>
        <button type="button" style={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div style={styles.formGridCompact}>
        <TextInput
          label="Location name"
          value={form.name}
          onChange={(value) => onChange((current) => ({ ...current, name: value }))}
        />
        <TextInput
          label="Service street"
          value={form.addressLine1}
          onChange={(value) => onChange((current) => ({ ...current, addressLine1: value }))}
        />
        <TextInput
          label="Service city"
          value={form.city}
          onChange={(value) => onChange((current) => ({ ...current, city: value }))}
        />
        <TextInput
          label="Service state"
          value={form.state}
          onChange={(value) => onChange((current) => ({ ...current, state: value }))}
        />
        <TextInput
          label="Service ZIP"
          value={form.postalCode}
          onChange={(value) => onChange((current) => ({ ...current, postalCode: value }))}
        />
        <TextInput
          label="Location phone"
          value={form.phone}
          onChange={(value) => onChange((current) => ({ ...current, phone: value }))}
        />
        <TextInput
          label="Location email"
          type="email"
          value={form.email}
          onChange={(value) => onChange((current) => ({ ...current, email: value }))}
        />
        <TextInput
          label="Location fax"
          value={form.fax}
          onChange={(value) => onChange((current) => ({ ...current, fax: value }))}
        />
      </div>
      {isMissingContactConfirmationVisible ? (
        <div style={styles.notice}>
          <p style={styles.tinyMuted}>
            This location has no phone or email. Confirm this is intentional before creating it.
          </p>
          <button
            type="button"
            style={styles.button}
            disabled={isSubmitting}
            onClick={onSubmitWithoutContact}
          >
            Create location without phone or email
          </button>
        </div>
      ) : null}
      <DuplicateWarnings warnings={duplicateWarnings} />
      <div style={styles.inlineActionBar}>
        <button
          type="button"
          style={styles.primaryButton}
          disabled={isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? 'Creating...' : 'Create location'}
        </button>
        {duplicateWarnings.length > 0 ? (
          <button
            type="button"
            style={styles.button}
            disabled={isSubmitting}
            onClick={onSubmitAnyway}
          >
            Create location anyway
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DuplicateWarnings({ warnings }: { warnings: DuplicateCandidate[] }) {
  if (warnings.length === 0) {
    return null;
  }

  return (
    <div aria-label="Duplicate warnings" role="group" style={styles.subpanel}>
      <p style={styles.sectionHeading}>Possible duplicate</p>
      <div style={styles.listCompact}>
        {warnings.map((warning) => (
          <div key={warning.id} style={{ ...styles.cardButton, cursor: 'default' }}>
            <strong>{warning.title}</strong>
            <span style={styles.tinyMuted}>{warning.subtitle}</span>
            {warning.hasDoNotServiceFlag ? <span style={styles.dangerBadge}>DNU</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatAddress(location: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
}): string {
  return [location.addressLine1, location.city, location.state, location.postalCode]
    .filter(Boolean)
    .join(', ');
}

function TextInput({
  label,
  value,
  type = 'text',
  onChange
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        style={styles.input}
      />
    </label>
  );
}
