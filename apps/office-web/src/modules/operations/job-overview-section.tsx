'use client';

import type { CSSProperties } from 'react';
import type {
  AppointmentSummary,
  CustomerAccountSummary,
  JobStatus,
  JobSummary,
  LocationSummary
} from '@/lib/operations-api';
import { formatAppointmentScheduleDisplay } from './appointment-schedule-format';
import { appointmentStatusLabels, type JobDetailTab } from './job-work-types';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

export const jobStatusLabels: Record<JobStatus, string> = {
  new: 'New',
  scheduled: 'Scheduled',
  inProgress: 'In progress',
  waitingOnParts: 'Waiting on parts',
  completed: 'Completed',
  closed: 'Closed',
  cancelled: 'Cancelled'
};

const jobStatusOptions: JobStatus[] = [
  'new',
  'scheduled',
  'inProgress',
  'waitingOnParts',
  'completed',
  'closed',
  'cancelled'
];

type JobOverviewSectionProps = {
  job: JobSummary;
  location: LocationSummary;
  billToCustomer: CustomerAccountSummary;
  equipmentCount: number;
  registerEntryCount: number;
  mediaAttachmentCount: number;
  focusedAppointmentId?: string | null;
  onSelectTab: (tab: JobDetailTab) => void;
  onOpenCustomer: (customerId: string, sourceJobId: string) => void;
  onOpenLocation: (locationId: string, sourceJobId: string) => void;
  onJobStatusReviewRequested: (
    jobId: string,
    currentStatus: JobStatus,
    status: JobStatus,
    summary: string
  ) => void;
};

export function JobOverviewSection({
  job,
  location,
  billToCustomer,
  equipmentCount,
  registerEntryCount,
  mediaAttachmentCount,
  focusedAppointmentId,
  onSelectTab,
  onOpenCustomer,
  onOpenLocation,
  onJobStatusReviewRequested
}: JobOverviewSectionProps) {
  const focusedAppointment = selectOverviewAppointment(job.appointments, focusedAppointmentId);
  const activeAppointmentCount = job.appointments.filter(
    (appointment) => appointment.status !== 'cancelled'
  ).length;

  return (
    <div style={overviewStackStyle}>
      <section style={styles.panel} aria-label="Job overview summary">
        <div style={overviewHeaderStyle}>
          <div style={overviewTitleBlockStyle}>
            <h2 style={sectionHeadingStyle}>Overview</h2>
            <div style={styles.badgeRow}>
              <span style={styles.badge}>{jobStatusLabels[job.status]}</span>
              {job.needsScheduling ? (
                <span style={styles.dangerBadge}>Needs scheduling</span>
              ) : null}
              {job.needsOfficeReview ? <span style={styles.dangerBadge}>Review needed</span> : null}
            </div>
          </div>
          <div style={overviewFactsStyle}>
            <FactPill label="Type" value={job.jobType} />
            <FactPill label="Category" value={job.category} />
            <FactPill label="Origin" value={job.origin} />
            {job.workOrderNumber ? (
              <FactPill label="Work order" value={job.workOrderNumber} />
            ) : null}
          </div>
        </div>
        <label style={fieldLabelStyle}>
          <span>Status</span>
          <select
            value={job.status}
            onChange={(event) =>
              onJobStatusReviewRequested(
                job.id,
                job.status,
                event.target.value as JobStatus,
                job.summary
              )
            }
            style={styles.input}
          >
            {jobStatusOptions.map((status) => (
              <option key={status} value={status}>
                {jobStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <div style={styles.detailGrid}>
        <section style={styles.panel} aria-label="Service Location">
          <h2 style={sectionHeadingStyle}>Service Location</h2>
          <LinkedRecord
            actionLabel={`Open location ${location.name}`}
            label="Location"
            onOpen={() => onOpenLocation(location.id, job.id)}
            value={location.name}
          />
          <DetailLine label="Address" value={formatLocationAddress(location)} />
          <ContactList
            emptyLabel="No service-location contact methods recorded."
            rows={buildLocationContactRows(location)}
          />
        </section>

        <section style={styles.panel} aria-label="Bill To">
          <h2 style={sectionHeadingStyle}>Bill To</h2>
          <LinkedRecord
            actionLabel={`Open customer ${billToCustomer.name}`}
            label="Customer"
            onOpen={() => onOpenCustomer(billToCustomer.id, job.id)}
            value={billToCustomer.name}
          />
          <DetailLine
            label="Billing address"
            value={formatCustomerBillingAddress(billToCustomer)}
          />
          <ContactList
            emptyLabel="No bill-to contact methods recorded."
            rows={buildCustomerContactRows(billToCustomer)}
          />
        </section>
      </div>

      <div style={overviewMainGridStyle}>
        <section style={styles.panel} aria-label="Job Summary">
          <h2 style={sectionHeadingStyle}>Job Summary / Office Notes</h2>
          <p style={summaryTextStyle}>{job.summary}</p>
          <div style={styles.formGridCompact}>
            <DetailLine label="Call type" value={job.origin} />
            <DetailLine label="Job type" value={job.jobType} />
            <DetailLine label="Category" value={job.category} />
          </div>
        </section>

        <section style={styles.panel} aria-label="Focused Appointment">
          <h2 style={sectionHeadingStyle}>
            {focusedAppointmentId && focusedAppointment
              ? 'Focused Appointment'
              : 'Next Appointment'}
          </h2>
          {focusedAppointment ? (
            <>
              <DetailLine
                label="Schedule"
                value={formatAppointmentScheduleDisplay(focusedAppointment)}
              />
              <DetailLine
                label="Technician"
                value={focusedAppointment.technicianName ?? 'Unassigned'}
              />
              <DetailLine
                label="Status"
                value={appointmentStatusLabels[focusedAppointment.status]}
              />
              <button
                type="button"
                style={styles.button}
                onClick={() => onSelectTab('appointments')}
              >
                Open appointments
              </button>
            </>
          ) : (
            <>
              <p style={styles.muted}>No active appointment is scheduled for this job yet.</p>
              <button
                type="button"
                style={styles.button}
                onClick={() => onSelectTab('appointments')}
              >
                Add appointment
              </button>
            </>
          )}
        </section>
      </div>

      <section style={styles.panel} aria-label="Work at a glance">
        <h2 style={sectionHeadingStyle}>Work at a glance</h2>
        <div style={overviewFactsStyle}>
          <OverviewAction
            label="Appointments"
            value={String(activeAppointmentCount)}
            onClick={() => onSelectTab('appointments')}
          />
          <OverviewAction
            label="Captured lines"
            value={String(registerEntryCount)}
            onClick={() => onSelectTab('captured')}
          />
          <OverviewAction
            label="Media"
            value={String(mediaAttachmentCount)}
            onClick={() => onSelectTab('media')}
          />
          <FactPill label="Equipment on site" value={String(equipmentCount)} />
        </div>
      </section>
    </div>
  );
}

function LinkedRecord({
  label,
  value,
  actionLabel,
  onOpen
}: {
  label: string;
  value: string;
  actionLabel?: string;
  onOpen?: () => void;
}) {
  return (
    <div>
      <div style={styles.tinyMuted}>{label}</div>
      <button
        type="button"
        aria-label={actionLabel}
        style={styles.tableLinkButton}
        onClick={onOpen}
      >
        {value}
      </button>
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={styles.tinyMuted}>{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  return (
    <span style={factPillStyle}>
      <span style={factPillLabelStyle}>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function OverviewAction({
  label,
  value,
  onClick
}: {
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button type="button" style={overviewActionStyle} onClick={onClick}>
      <span style={factPillLabelStyle}>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

type ContactRow = {
  label: string;
  value: string;
};

function ContactList({ emptyLabel, rows }: { emptyLabel: string; rows: ContactRow[] }) {
  if (rows.length === 0) {
    return <p style={styles.muted}>{emptyLabel}</p>;
  }

  return (
    <div style={contactListStyle}>
      {rows.map((row) => (
        <div key={`${row.label}-${row.value}`} style={contactRowStyle}>
          <span style={styles.tinyMuted}>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}

function buildLocationContactRows(location: LocationSummary): ContactRow[] {
  const rows: ContactRow[] = [];

  if (location.phone) rows.push({ label: 'Service location phone', value: location.phone });
  if (location.email) rows.push({ label: 'Service location email', value: location.email });
  if (location.fax) rows.push({ label: 'Service location fax', value: location.fax });

  for (const contact of location.contacts) {
    if (!contact.isActive) continue;
    if (contact.phone) rows.push({ label: `${contact.displayName} phone`, value: contact.phone });
    if (contact.email) rows.push({ label: `${contact.displayName} email`, value: contact.email });
  }

  return rows;
}

function buildCustomerContactRows(customer: CustomerAccountSummary): ContactRow[] {
  return [
    customer.phone ? { label: 'Bill-to phone', value: customer.phone } : undefined,
    customer.email ? { label: 'Bill-to email', value: customer.email } : undefined,
    customer.fax ? { label: 'Bill-to fax', value: customer.fax } : undefined
  ].filter((row): row is ContactRow => Boolean(row));
}

function formatLocationAddress(location: LocationSummary): string {
  const cityState = [location.city, location.state].filter(Boolean).join(', ');
  const cityStatePostal = [cityState, location.postalCode].filter(Boolean).join(' ');
  return [location.addressLine1, cityStatePostal].filter(Boolean).join(', ');
}

function formatCustomerBillingAddress(customer: CustomerAccountSummary): string {
  const cityState = [customer.billingCity, customer.billingState].filter(Boolean).join(', ');
  const cityStatePostal = [cityState, customer.billingPostalCode].filter(Boolean).join(' ');
  return [customer.billingAddressLine1, cityStatePostal].filter(Boolean).join(', ');
}

function selectOverviewAppointment(
  appointments: AppointmentSummary[],
  focusedAppointmentId: string | null | undefined
): AppointmentSummary | undefined {
  const focusedAppointment = focusedAppointmentId
    ? appointments.find((appointment) => appointment.id === focusedAppointmentId)
    : undefined;

  if (focusedAppointment) {
    return focusedAppointment;
  }

  const activeAppointments = appointments.filter(
    (appointment) => appointment.status !== 'cancelled'
  );
  return sortAppointments(activeAppointments.length > 0 ? activeAppointments : appointments)[0];
}

function sortAppointments(appointments: AppointmentSummary[]): AppointmentSummary[] {
  return [...appointments].sort((left, right) =>
    buildAppointmentSortKey(left).localeCompare(buildAppointmentSortKey(right))
  );
}

function buildAppointmentSortKey(appointment: AppointmentSummary): string {
  return [
    appointment.scheduledDate || '9999-12-31',
    appointment.scheduledStartTime || '99:99',
    appointment.scheduledEndTime || '99:99',
    appointment.timeWindowLabel || 'zzzzzz',
    appointment.createdAt
  ].join('|');
}

const fieldLabelStyle: CSSProperties = {
  display: 'grid',
  gap: '0.25rem',
  fontSize: '0.85rem',
  fontWeight: 700
};

const overviewStackStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem'
};

const overviewHeaderStyle: CSSProperties = {
  display: 'grid',
  gap: '0.85rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))'
};

const overviewTitleBlockStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem'
};

const overviewFactsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem'
};

const overviewMainGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))'
};

const sectionHeadingStyle: CSSProperties = {
  fontSize: '1rem',
  margin: 0
};

const summaryTextStyle: CSSProperties = {
  color: '#1f2933',
  fontSize: '1rem',
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: 'pre-wrap'
};

const factPillStyle: CSSProperties = {
  background: '#f7f8f6',
  border: '1px solid #dfe6df',
  borderRadius: 8,
  display: 'grid',
  gap: '0.15rem',
  minWidth: '8rem',
  padding: '0.5rem 0.65rem'
};

const factPillLabelStyle: CSSProperties = {
  color: '#7b8794',
  fontSize: '0.72rem',
  fontWeight: 800,
  textTransform: 'uppercase'
};

const overviewActionStyle: CSSProperties = {
  ...factPillStyle,
  color: '#1f2933',
  cursor: 'pointer',
  textAlign: 'left'
};

const contactListStyle: CSSProperties = {
  display: 'grid',
  gap: '0.5rem'
};

const contactRowStyle: CSSProperties = {
  display: 'grid',
  gap: '0.1rem'
};
