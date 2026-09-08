'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { DuplicateCandidate } from '@/lib/operations-api';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { useAsyncAction } from '@/components/use-async-action';
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
  onCreateLocation: (options?: CreateLocationOptions) => Promise<void>;
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
  const createLocation = useAsyncAction(onCreateLocation);

  function setField(patch: Partial<LocationFormState>, clearsDuplicates = false) {
    onChangeLocationForm((current) => ({ ...current, ...patch }));
    if (clearsDuplicates) {
      onClearDuplicateWarnings();
    }
  }

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
        <FormField label="Location name">
          <input
            value={locationForm.name}
            onChange={(event) => setField({ name: event.target.value }, true)}
            style={styles.input}
          />
        </FormField>
        <FormField label="Service address">
          <input
            value={locationForm.addressLine1}
            onChange={(event) => setField({ addressLine1: event.target.value }, true)}
            style={styles.input}
          />
        </FormField>
        <FormField label="City">
          <input
            value={locationForm.city}
            onChange={(event) => setField({ city: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="State">
          <input
            value={locationForm.state}
            onChange={(event) => setField({ state: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Postal code">
          <input
            value={locationForm.postalCode}
            onChange={(event) => setField({ postalCode: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Phone">
          <input
            value={locationForm.phone}
            onChange={(event) => setField({ phone: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Email">
          <input
            value={locationForm.email}
            onChange={(event) => setField({ email: event.target.value })}
            style={styles.input}
          />
        </FormField>
        <FormField label="Fax">
          <input
            value={locationForm.fax}
            onChange={(event) => setField({ fax: event.target.value })}
            style={styles.input}
          />
        </FormField>
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
            <SubmitButton
              isBusy={createLocation.isBusy}
              busyLabel="Creating…"
              onClick={() => void createLocation.run({ confirmDuplicate: true })}
            >
              Create anyway
            </SubmitButton>
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
            <SubmitButton
              isBusy={createLocation.isBusy}
              busyLabel="Creating…"
              onClick={() => void createLocation.run({ confirmMissingContactInfo: true })}
            >
              Create without phone or email
            </SubmitButton>
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
      <SubmitButton
        isBusy={createLocation.isBusy}
        busyLabel="Creating…"
        onClick={() => void createLocation.run()}
      >
        Create location
      </SubmitButton>
    </div>
  );
}
