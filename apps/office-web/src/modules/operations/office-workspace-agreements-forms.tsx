'use client';

import type {
  CreateServiceAgreementRequest,
  CustomerAccountSummary,
  EquipmentSummary,
  LocationSummary,
  ServiceAgreementBillingCadence,
  ServiceAgreementSummary,
  ServiceAgreementVisitFrequency,
  ServiceAgreementVisitTemplateInput,
  UpdateServiceAgreementRequest
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export type AgreementDraft = {
  customerId: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  renewalDate: string;
  billingCadence: ServiceAgreementBillingCadence;
  nextBillingDate: string;
  billingAmount: string;
  coveredLocationIds: string[];
  coveredEquipmentIds: string[];
  visitTemplates: VisitTemplateDraft[];
};

type VisitTemplateDraft = {
  localId: string;
  title: string;
  frequency: ServiceAgreementVisitFrequency;
  intervalMonths: string;
  preferredMonth: string;
  preferredDayOfMonth: string;
  timeWindowLabel: string;
  jobType: string;
  category: string;
  summary: string;
  estimatedDurationMinutes: string;
  isActive: boolean;
};

export type ActiveAgreementForm =
  | { kind: 'create'; draft: AgreementDraft }
  | { kind: 'edit'; agreementId: string; draft: AgreementDraft };

export type AgreementWorkbenchSources = {
  customers: CustomerAccountSummary[];
  locations: LocationSummary[];
  equipment: EquipmentSummary[];
};

export const billingCadenceLabels: Record<ServiceAgreementBillingCadence, string> = {
  none: 'No recurring billing',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiAnnual: 'Semiannual',
  annual: 'Annual',
  custom: 'Custom'
};

export const visitFrequencyLabels: Record<ServiceAgreementVisitFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  semiAnnual: 'Semiannual',
  annual: 'Annual',
  custom: 'Custom'
};

const billingCadences = Object.keys(billingCadenceLabels) as ServiceAgreementBillingCadence[];
const visitFrequencies = Object.keys(visitFrequencyLabels) as ServiceAgreementVisitFrequency[];

export function AgreementForm({
  form,
  sources,
  isSaving,
  onChange,
  onCancel,
  onSubmit
}: {
  form: ActiveAgreementForm;
  sources: AgreementWorkbenchSources;
  isSaving: boolean;
  onChange: (form: ActiveAgreementForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const customerLocations = sources.locations.filter(
    (location) => location.customerId === form.draft.customerId
  );
  const coveredLocationSet = new Set(form.draft.coveredLocationIds);
  const eligibleEquipment = sources.equipment.filter(
    (equipment) => equipment.locationId && coveredLocationSet.has(equipment.locationId)
  );
  const visitTemplatesValid = form.draft.visitTemplates.every((template) => template.title.trim());
  const submitDisabled =
    isSaving ||
    !form.draft.name.trim() ||
    !form.draft.customerId ||
    form.draft.coveredLocationIds.length === 0 ||
    !visitTemplatesValid;

  function patch(patchValue: Partial<AgreementDraft>) {
    onChange({ ...form, draft: { ...form.draft, ...patchValue } });
  }

  function patchTemplate(localId: string, patchValue: Partial<VisitTemplateDraft>) {
    patch({
      visitTemplates: form.draft.visitTemplates.map((template) =>
        template.localId === localId ? { ...template, ...patchValue } : template
      )
    });
  }

  return (
    <form
      style={styles.panel}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div style={styles.row}>
        <h2 style={styles.heading}>
          {form.kind === 'create' ? 'New service agreement' : 'Edit service agreement'}
        </h2>
        <div style={styles.inlineActionBar}>
          <button type="submit" style={styles.primaryButton} disabled={submitDisabled}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" style={styles.button} disabled={isSaving} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div style={styles.formGridCompact}>
        <label style={styles.fieldLabel}>
          Customer
          <select
            style={styles.input}
            value={form.draft.customerId}
            disabled={form.kind === 'edit'}
            onChange={(event) =>
              patch({
                customerId: event.target.value,
                coveredLocationIds: [],
                coveredEquipmentIds: []
              })
            }
          >
            <option value="">Select customer</option>
            {sources.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Name" value={form.draft.name} onChange={(name) => patch({ name })} />
        <DateField
          label="Start"
          value={form.draft.startDate}
          onChange={(startDate) => patch({ startDate })}
        />
        <DateField
          label="End"
          value={form.draft.endDate}
          onChange={(endDate) => patch({ endDate })}
        />
        <DateField
          label="Renewal"
          value={form.draft.renewalDate}
          onChange={(renewalDate) => patch({ renewalDate })}
        />
        <label style={styles.fieldLabel}>
          Billing cadence
          <select
            style={styles.input}
            value={form.draft.billingCadence}
            onChange={(event) =>
              patch({ billingCadence: event.target.value as ServiceAgreementBillingCadence })
            }
          >
            {billingCadences.map((cadence) => (
              <option key={cadence} value={cadence}>
                {billingCadenceLabels[cadence]}
              </option>
            ))}
          </select>
        </label>
        <DateField
          label="Next billing"
          value={form.draft.nextBillingDate}
          onChange={(nextBillingDate) => patch({ nextBillingDate })}
        />
        <TextField
          label="Billing amount"
          value={form.draft.billingAmount}
          onChange={(billingAmount) => patch({ billingAmount })}
        />
        <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
          Description
          <textarea
            style={styles.textarea}
            value={form.draft.description}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </label>
      </div>

      <CheckboxSection
        title="Covered locations"
        emptyText="This customer has no locations available."
        items={customerLocations.map((location) => ({
          id: location.id,
          label: location.name,
          detail: `${location.addressLine1}, ${location.city}, ${location.state}`,
          checked: form.draft.coveredLocationIds.includes(location.id)
        }))}
        onToggle={(locationId, checked) => {
          const nextLocations = checked
            ? [...form.draft.coveredLocationIds, locationId]
            : form.draft.coveredLocationIds.filter((id) => id !== locationId);
          const nextLocationSet = new Set(nextLocations);
          patch({
            coveredLocationIds: nextLocations,
            coveredEquipmentIds: form.draft.coveredEquipmentIds.filter((equipmentId) => {
              const equipment = sources.equipment.find((item) => item.id === equipmentId);
              return Boolean(equipment?.locationId && nextLocationSet.has(equipment.locationId));
            })
          });
        }}
      />

      <CheckboxSection
        title="Covered equipment"
        emptyText={
          form.draft.coveredLocationIds.length === 0
            ? 'Select at least one location before adding equipment coverage.'
            : 'No equipment is assigned to the selected covered locations.'
        }
        items={eligibleEquipment.map((equipment) => ({
          id: equipment.id,
          label: formatEquipmentLabel(equipment),
          detail: equipment.locationName ?? 'No location',
          checked: form.draft.coveredEquipmentIds.includes(equipment.id)
        }))}
        onToggle={(equipmentId, checked) =>
          patch({
            coveredEquipmentIds: checked
              ? [...form.draft.coveredEquipmentIds, equipmentId]
              : form.draft.coveredEquipmentIds.filter((id) => id !== equipmentId)
          })
        }
      />

      <section style={styles.formSection}>
        <div style={styles.row}>
          <h3 style={styles.sectionHeading}>Visit templates</h3>
          <button
            type="button"
            style={styles.button}
            disabled={isSaving}
            onClick={() =>
              patch({ visitTemplates: [...form.draft.visitTemplates, emptyVisitTemplateDraft()] })
            }
          >
            Add visit template
          </button>
        </div>
        {form.draft.visitTemplates.length === 0 ? (
          <p style={styles.muted}>No recurring visit templates.</p>
        ) : (
          <div style={styles.listCompact}>
            {form.draft.visitTemplates.map((template, index) => (
              <div key={template.localId} style={styles.subpanel}>
                <div style={styles.row}>
                  <strong>Template {index + 1}</strong>
                  <label style={styles.inlineLabel}>
                    <input
                      type="checkbox"
                      checked={template.isActive}
                      onChange={(event) =>
                        patchTemplate(template.localId, { isActive: event.target.checked })
                      }
                    />
                    Active
                  </label>
                </div>
                <div style={styles.formGridCompact}>
                  <TextField
                    label="Title"
                    value={template.title}
                    onChange={(title) => patchTemplate(template.localId, { title })}
                  />
                  <label style={styles.fieldLabel}>
                    Frequency
                    <select
                      style={styles.input}
                      value={template.frequency}
                      onChange={(event) =>
                        patchTemplate(template.localId, {
                          frequency: event.target.value as ServiceAgreementVisitFrequency
                        })
                      }
                    >
                      {visitFrequencies.map((frequency) => (
                        <option key={frequency} value={frequency}>
                          {visitFrequencyLabels[frequency]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <TextField
                    label="Interval months"
                    value={template.intervalMonths}
                    onChange={(intervalMonths) =>
                      patchTemplate(template.localId, { intervalMonths })
                    }
                  />
                  <TextField
                    label="Preferred month"
                    value={template.preferredMonth}
                    onChange={(preferredMonth) =>
                      patchTemplate(template.localId, { preferredMonth })
                    }
                  />
                  <TextField
                    label="Preferred day"
                    value={template.preferredDayOfMonth}
                    onChange={(preferredDayOfMonth) =>
                      patchTemplate(template.localId, { preferredDayOfMonth })
                    }
                  />
                  <TextField
                    label="Window"
                    value={template.timeWindowLabel}
                    onChange={(timeWindowLabel) =>
                      patchTemplate(template.localId, { timeWindowLabel })
                    }
                  />
                  <TextField
                    label="Job type"
                    value={template.jobType}
                    onChange={(jobType) => patchTemplate(template.localId, { jobType })}
                  />
                  <TextField
                    label="Category"
                    value={template.category}
                    onChange={(category) => patchTemplate(template.localId, { category })}
                  />
                  <TextField
                    label="Duration minutes"
                    value={template.estimatedDurationMinutes}
                    onChange={(estimatedDurationMinutes) =>
                      patchTemplate(template.localId, { estimatedDurationMinutes })
                    }
                  />
                  <label style={{ ...styles.fieldLabel, ...styles.formGridFullWidth }}>
                    Summary
                    <textarea
                      style={styles.textarea}
                      value={template.summary}
                      onChange={(event) =>
                        patchTemplate(template.localId, { summary: event.target.value })
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  style={styles.dangerButton}
                  disabled={isSaving}
                  onClick={() =>
                    patch({
                      visitTemplates: form.draft.visitTemplates.filter(
                        (item) => item.localId !== template.localId
                      )
                    })
                  }
                >
                  Remove template
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </form>
  );
}

export function emptyAgreementDraft(customerId: string): AgreementDraft {
  return {
    customerId,
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    renewalDate: '',
    billingCadence: 'none',
    nextBillingDate: '',
    billingAmount: '',
    coveredLocationIds: [],
    coveredEquipmentIds: [],
    visitTemplates: []
  };
}

export function draftFromAgreement(agreement: ServiceAgreementSummary): AgreementDraft {
  return {
    customerId: agreement.customerId,
    name: agreement.name,
    description: agreement.description ?? '',
    startDate: agreement.startDate ?? '',
    endDate: agreement.endDate ?? '',
    renewalDate: agreement.renewalDate ?? '',
    billingCadence: agreement.billingCadence,
    nextBillingDate: agreement.nextBillingDate ?? '',
    billingAmount: agreement.billingAmount === undefined ? '' : String(agreement.billingAmount),
    coveredLocationIds: agreement.coveredLocations.map((location) => location.locationId),
    coveredEquipmentIds: agreement.coveredEquipment.map((equipment) => equipment.equipmentId),
    visitTemplates: agreement.visitTemplates.map((template) => ({
      localId: template.id,
      title: template.title,
      frequency: template.frequency,
      intervalMonths: template.intervalMonths === undefined ? '' : String(template.intervalMonths),
      preferredMonth: template.preferredMonth === undefined ? '' : String(template.preferredMonth),
      preferredDayOfMonth:
        template.preferredDayOfMonth === undefined ? '' : String(template.preferredDayOfMonth),
      timeWindowLabel: template.timeWindowLabel ?? '',
      jobType: template.jobType ?? '',
      category: template.category ?? '',
      summary: template.summary ?? '',
      estimatedDurationMinutes:
        template.estimatedDurationMinutes === undefined
          ? ''
          : String(template.estimatedDurationMinutes),
      isActive: template.isActive
    }))
  };
}

export function toCreateRequest(draft: AgreementDraft): CreateServiceAgreementRequest {
  return {
    customerId: draft.customerId,
    name: draft.name.trim(),
    description: emptyToUndefined(draft.description),
    startDate: emptyToUndefined(draft.startDate),
    endDate: emptyToUndefined(draft.endDate),
    renewalDate: emptyToUndefined(draft.renewalDate),
    billingCadence: draft.billingCadence,
    nextBillingDate: emptyToUndefined(draft.nextBillingDate),
    billingAmount: parseOptionalNumber(draft.billingAmount),
    coveredLocationIds: draft.coveredLocationIds,
    coveredEquipmentIds: draft.coveredEquipmentIds,
    visitTemplates: draft.visitTemplates.map(toVisitTemplateRequest)
  };
}

export function toUpdateRequest(draft: AgreementDraft): UpdateServiceAgreementRequest {
  return {
    name: draft.name.trim(),
    description: emptyToUndefined(draft.description),
    startDate: emptyToUndefined(draft.startDate),
    endDate: emptyToUndefined(draft.endDate),
    renewalDate: emptyToUndefined(draft.renewalDate),
    billingCadence: draft.billingCadence,
    nextBillingDate: emptyToUndefined(draft.nextBillingDate),
    billingAmount: parseOptionalNumber(draft.billingAmount),
    coveredLocationIds: draft.coveredLocationIds,
    coveredEquipmentIds: draft.coveredEquipmentIds,
    visitTemplates: draft.visitTemplates.map(toVisitTemplateRequest)
  };
}

function CheckboxSection({
  title,
  emptyText,
  items,
  onToggle
}: {
  title: string;
  emptyText: string;
  items: Array<{ id: string; label: string; detail: string; checked: boolean }>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <section style={styles.formSection}>
      <h3 style={styles.sectionHeading}>{title}</h3>
      {items.length === 0 ? (
        <p style={styles.muted}>{emptyText}</p>
      ) : (
        <div style={styles.grid}>
          {items.map((item) => (
            <label key={item.id} style={styles.subpanel}>
              <span style={styles.inlineLabel}>
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
                <strong>{item.label}</strong>
              </span>
              <span style={styles.tinyMuted}>{item.detail}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        style={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      {label}
      <input
        type="date"
        style={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function emptyVisitTemplateDraft(): VisitTemplateDraft {
  return {
    localId: `template-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: '',
    frequency: 'annual',
    intervalMonths: '',
    preferredMonth: '',
    preferredDayOfMonth: '',
    timeWindowLabel: '',
    jobType: '',
    category: '',
    summary: '',
    estimatedDurationMinutes: '',
    isActive: true
  };
}

function toVisitTemplateRequest(template: VisitTemplateDraft): ServiceAgreementVisitTemplateInput {
  return {
    title: template.title.trim(),
    frequency: template.frequency,
    intervalMonths: parseOptionalInteger(template.intervalMonths),
    preferredMonth: parseOptionalInteger(template.preferredMonth),
    preferredDayOfMonth: parseOptionalInteger(template.preferredDayOfMonth),
    timeWindowLabel: emptyToUndefined(template.timeWindowLabel),
    jobType: emptyToUndefined(template.jobType),
    category: emptyToUndefined(template.category),
    summary: emptyToUndefined(template.summary),
    estimatedDurationMinutes: parseOptionalInteger(template.estimatedDurationMinutes),
    isActive: template.isActive
  };
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: string): number | undefined {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function formatEquipmentLabel(equipment: EquipmentSummary): string {
  const serial = equipment.serialNumber ? ` (${equipment.serialNumber})` : '';
  return `${equipment.equipmentType} - ${equipment.brand} ${equipment.model}${serial}`;
}
