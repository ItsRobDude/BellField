'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { DuplicateCandidate } from '@/lib/operations-api';
import type { LocationFormState } from './crm-panel-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CreateLocationOptions = {
  confirmDuplicate?: boolean;
  confirmMissingContactInfo?: boolean;
};

type CrmLocationCreatePanelProps = {
  duplicateWarnings: DuplicateCandidate[];
  locationForm: LocationFormState;
  missingContactConfirmation: boolean;
  ownerCustomerName: string;
  onBack: () => void;
  onCancelMissingContactConfirmation: () => void;
  onChangeLocationForm: Dispatch<SetStateAction<LocationFormState>>;
  onClearDuplicateWarnings: () => void;
  onCreateLocation: (options?: CreateLocationOptions) => void;
};

export function CrmLocationCreatePanel({
  duplicateWarnings,
  locationForm,
  missingContactConfirmation,
  ownerCustomerName,
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
      <div style={styles.subpanel}>
        <strong>Owner</strong>
        <div style={styles.tinyMuted}>{ownerCustomerName}</div>
      </div>
      <div style={styles.formRow}>
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
