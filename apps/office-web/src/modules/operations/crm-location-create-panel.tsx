'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CrmWorkspaceResponse, DuplicateCandidate } from '@/lib/operations-api';
import type { LocationFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CreateLocationOptions = {
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
};

type CrmLocationCreatePanelProps = {
  activeCustomerOptions: CrmWorkspaceResponse['customers'];
  duplicateWarnings: DuplicateCandidate[];
  locationForm: LocationFormState;
  missingContactConfirmation: boolean;
  onBack: () => void;
  onCancelMissingContactConfirmation: () => void;
  onChangeLocationForm: Dispatch<SetStateAction<LocationFormState>>;
  onClearDuplicateWarnings: () => void;
  onCreateLocation: (options?: CreateLocationOptions) => void;
};

export function CrmLocationCreatePanel({
  activeCustomerOptions,
  duplicateWarnings,
  locationForm,
  missingContactConfirmation,
  onBack,
  onCancelMissingContactConfirmation,
  onChangeLocationForm,
  onClearDuplicateWarnings,
  onCreateLocation
}: CrmLocationCreatePanelProps) {
  return (
    <div style={styles.panel}>
      <div style={styles.row}>
        <h3 style={styles.subheading}>Create location</h3>
        <button type="button" onClick={onBack} style={styles.button}>
          Back
        </button>
      </div>
      <div style={styles.formRow}>
        <select
          value={locationForm.customerId}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, customerId: event.target.value }))
          }
          style={styles.input}
        >
          {activeCustomerOptions.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </select>
        <input
          value={locationForm.name}
          onChange={(event) => {
            onChangeLocationForm((current) => ({ ...current, name: event.target.value }));
            onClearDuplicateWarnings();
          }}
          placeholder="Location name"
          style={styles.input}
        />
        <input
          value={locationForm.addressLine1}
          onChange={(event) => {
            onChangeLocationForm((current) => ({
              ...current,
              addressLine1: event.target.value
            }));
            onClearDuplicateWarnings();
          }}
          placeholder="Service address"
          style={styles.input}
        />
        <input
          value={locationForm.city}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, city: event.target.value }))
          }
          placeholder="City"
          style={styles.input}
        />
        <input
          value={locationForm.state}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, state: event.target.value }))
          }
          placeholder="State"
          style={styles.input}
        />
        <input
          value={locationForm.postalCode}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, postalCode: event.target.value }))
          }
          placeholder="Postal code"
          style={styles.input}
        />
        <input
          value={locationForm.phone}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, phone: event.target.value }))
          }
          placeholder="Phone"
          style={styles.input}
        />
        <input
          value={locationForm.email}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, email: event.target.value }))
          }
          placeholder="Email"
          style={styles.input}
        />
        <input
          value={locationForm.fax}
          onChange={(event) =>
            onChangeLocationForm((current) => ({ ...current, fax: event.target.value }))
          }
          placeholder="Fax"
          style={styles.input}
        />
      </div>
      <label style={styles.inlineLabel}>
        <span>Alternate bill-to customers</span>
        <select
          multiple
          value={locationForm.alternateBillToCustomerIds}
          onChange={(event) =>
            onChangeLocationForm((current) => ({
              ...current,
              alternateBillToCustomerIds: Array.from(event.target.selectedOptions).map(
                (option) => option.value
              )
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
      {duplicateWarnings.length > 0 ? (
        <div style={styles.subpanel}>
          <strong>Possible duplicate location</strong>
          {duplicateWarnings.map((warning) => (
            <div key={warning.id} style={styles.tinyMuted}>
              {warning.title} - {warning.subtitle}
            </div>
          ))}
          <div style={styles.row}>
            <button
              type="button"
              onClick={() => onCreateLocation({ confirmDuplicate: true })}
              style={styles.primaryButton}
            >
              Create anyway
            </button>
            <button type="button" onClick={onClearDuplicateWarnings} style={styles.button}>
              Keep editing
            </button>
          </div>
        </div>
      ) : null}
      {missingContactConfirmation ? (
        <div style={styles.subpanel}>
          <strong>Location has no phone or email</strong>
          <div style={styles.tinyMuted}>This location has no phone or email. Is that okay?</div>
          {locationForm.fax.trim() ? (
            <div style={styles.tinyMuted}>
              Fax will be saved, but phone and email are still missing.
            </div>
          ) : null}
          <div style={styles.row}>
            <button
              type="button"
              onClick={() => onCreateLocation({ confirmMissingContactInfo: true })}
              style={styles.primaryButton}
            >
              Create without phone or email
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
      <button type="button" onClick={() => onCreateLocation()} style={styles.primaryButton}>
        Create location
      </button>
    </div>
  );
}
