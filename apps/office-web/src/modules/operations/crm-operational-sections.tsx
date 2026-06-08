'use client';

import type {
  ContactMethodSummary,
  CrmActivityEntry,
  CrmOperationalAgreementSummary,
  CrmOperationalContext,
  CrmOperationalJobSummary
} from '@/lib/operations-api';
import { officeWorkspaceStyles as styles } from './office-workspace-styles';

type CrmOperationalOverviewProps = {
  operational: CrmOperationalContext;
  contactMethods: ContactMethodSummary[];
  ownerLabel?: string;
};

export function CrmOperationalOverview({
  operational,
  contactMethods,
  ownerLabel
}: CrmOperationalOverviewProps) {
  const primaryPhone = findPrimaryMethod(contactMethods, 'phone');
  const primaryEmail = findPrimaryMethod(contactMethods, 'email');

  return (
    <div style={styles.grid}>
      {ownerLabel ? (
        <div style={styles.subpanel}>
          <strong>Current customer</strong>
          <span>{ownerLabel}</span>
        </div>
      ) : null}
      <div style={styles.subpanel}>
        <strong>Main methods</strong>
        <span style={styles.tinyMuted}>{primaryPhone?.value ?? 'No primary phone'}</span>
        <span style={styles.tinyMuted}>{primaryEmail?.value ?? 'No primary email'}</span>
      </div>
      <div style={styles.subpanel}>
        <strong>Open jobs</strong>
        <span>{operational.summary.openJobCount}</span>
      </div>
      <div style={styles.subpanel}>
        <strong>Last service</strong>
        <span>{formatDate(operational.summary.lastServiceAt) ?? 'No finished service yet'}</span>
      </div>
      <div style={styles.subpanel}>
        <strong>Equipment</strong>
        <span>{operational.summary.equipmentCount} active / pending</span>
      </div>
      <div style={styles.subpanel}>
        <strong>Agreements</strong>
        <span>{operational.summary.activeAgreementCount} active</span>
        <span style={styles.tinyMuted}>{operational.summary.endedAgreementCount} ended</span>
      </div>
    </div>
  );
}

export function CrmJobsSection({ operational }: { operational: CrmOperationalContext }) {
  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>Jobs</strong>
        <span style={styles.tinyMuted}>
          {operational.summary.appointmentCount} appointments recorded
        </span>
      </div>
      {operational.jobs.length > 0 ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Job</th>
                <th style={styles.tableHeadCell}>Location</th>
                <th style={styles.tableHeadCell}>Bill to</th>
                <th style={styles.tableHeadCell}>Status</th>
                <th style={styles.tableHeadCell}>Next appointment</th>
              </tr>
            </thead>
            <tbody>
              {operational.jobs.map((job) => (
                <tr key={job.id}>
                  <td style={styles.tableCell}>
                    <strong>{job.jobNumber}</strong>
                    <div style={styles.tinyMuted}>{job.summary}</div>
                  </td>
                  <td style={styles.tableCell}>{job.locationName}</td>
                  <td style={styles.tableCell}>{job.billToCustomerName}</td>
                  <td style={styles.tableCell}>{formatCamelStatus(job.status)}</td>
                  <td style={styles.tableCell}>{formatJobAppointment(job)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={styles.muted}>No jobs recorded yet.</p>
      )}
    </div>
  );
}

export function CrmInvoicesSection({ operational }: { operational: CrmOperationalContext }) {
  return (
    <div style={styles.list}>
      <div style={styles.subpanel}>
        <div style={styles.row}>
          <strong>Invoices</strong>
          <span style={styles.tinyMuted}>{operational.summary.invoiceCount} total</span>
        </div>
        {operational.invoices.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Invoice</th>
                  <th style={styles.tableHeadCell}>Job</th>
                  <th style={styles.tableHeadCell}>Status</th>
                  <th style={styles.tableHeadCell}>Total</th>
                </tr>
              </thead>
              <tbody>
                {operational.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td style={styles.tableCell}>{formatCamelStatus(invoice.invoiceKind)}</td>
                    <td style={styles.tableCell}>{invoice.jobNumber}</td>
                    <td style={styles.tableCell}>
                      {formatCamelStatus(invoice.status)}
                      {!invoice.costComplete ? (
                        <div style={styles.tinyMuted}>Cost incomplete</div>
                      ) : null}
                    </td>
                    <td style={styles.tableCell}>{formatCurrency(invoice.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={styles.muted}>No invoices recorded yet.</p>
        )}
      </div>
      <div style={styles.subpanel}>
        <div style={styles.row}>
          <strong>Estimates</strong>
          <span style={styles.tinyMuted}>{operational.summary.estimateCount} total</span>
        </div>
        {operational.estimates.length > 0 ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.tableHeadCell}>Estimate</th>
                  <th style={styles.tableHeadCell}>Job</th>
                  <th style={styles.tableHeadCell}>Status</th>
                  <th style={styles.tableHeadCell}>Total</th>
                </tr>
              </thead>
              <tbody>
                {operational.estimates.map((estimate) => (
                  <tr key={estimate.id}>
                    <td style={styles.tableCell}>
                      <strong>{estimate.title}</strong>
                      {estimate.validUntil ? (
                        <div style={styles.tinyMuted}>
                          Valid until {formatDate(estimate.validUntil)}
                        </div>
                      ) : null}
                    </td>
                    <td style={styles.tableCell}>{estimate.jobNumber}</td>
                    <td style={styles.tableCell}>
                      {formatCamelStatus(estimate.status)}
                      {!estimate.costComplete ? (
                        <div style={styles.tinyMuted}>Cost incomplete</div>
                      ) : null}
                    </td>
                    <td style={styles.tableCell}>{formatCurrency(estimate.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={styles.muted}>No estimates recorded yet.</p>
        )}
      </div>
    </div>
  );
}

export function CrmAgreementsSection({ operational }: { operational: CrmOperationalContext }) {
  const activeAgreements = operational.agreements.filter(
    (agreement) => agreement.status === 'active'
  );
  const endedAgreements = operational.agreements.filter(
    (agreement) => agreement.status === 'ended'
  );

  return (
    <div style={styles.subpanel}>
      <div style={styles.row}>
        <strong>Service agreements</strong>
        <span style={styles.tinyMuted}>
          {activeAgreements.length} active / {endedAgreements.length} ended
        </span>
      </div>
      {operational.agreements.length > 0 ? (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeadCell}>Agreement</th>
                <th style={styles.tableHeadCell}>Status</th>
                <th style={styles.tableHeadCell}>Coverage</th>
                <th style={styles.tableHeadCell}>Billing</th>
                <th style={styles.tableHeadCell}>Visits</th>
              </tr>
            </thead>
            <tbody>
              {operational.agreements.map((agreement) => (
                <tr key={agreement.id}>
                  <td style={styles.tableCell}>
                    <strong>{agreement.agreementNumber}</strong>
                    <div style={styles.tinyMuted}>{agreement.name}</div>
                    {agreement.renewalDate ? (
                      <div style={styles.tinyMuted}>Renews {formatDate(agreement.renewalDate)}</div>
                    ) : null}
                  </td>
                  <td style={styles.tableCell}>{formatCamelStatus(agreement.status)}</td>
                  <td style={styles.tableCell}>{formatAgreementCoverage(agreement)}</td>
                  <td style={styles.tableCell}>{formatAgreementBilling(agreement)}</td>
                  <td style={styles.tableCell}>
                    {agreement.activeVisitTemplateCount} active template(s)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={styles.muted}>No active or ended service agreements recorded.</p>
      )}
    </div>
  );
}

export function CrmActivitySection({ activity }: { activity: CrmActivityEntry[] }) {
  return (
    <div style={styles.subpanel}>
      <strong>Activity</strong>
      {activity.length > 0 ? (
        <div style={styles.listCompact}>
          {activity.map((entry) => (
            <div key={`${entry.kind}-${entry.id}`} style={styles.cardButton}>
              <strong>{entry.title}</strong>
              <span style={styles.tinyMuted}>
                {formatDateTime(entry.occurredAt)}
                {entry.actorName ? ` · ${entry.actorName}` : ''}
                {entry.jobNumber ? ` · Job ${entry.jobNumber}` : ''}
                {entry.locationName ? ` · ${entry.locationName}` : ''}
              </span>
              {entry.detail ? <span style={styles.tinyMuted}>{entry.detail}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <p style={styles.muted}>No activity recorded yet.</p>
      )}
    </div>
  );
}

function findPrimaryMethod(
  contactMethods: ContactMethodSummary[],
  kind: ContactMethodSummary['kind']
) {
  return (
    contactMethods.find((method) => method.kind === kind && method.isPrimary && method.isActive) ??
    contactMethods.find((method) => method.kind === kind && method.isActive)
  );
}

function formatJobAppointment(job: CrmOperationalJobSummary): string {
  if (!job.nextAppointment) {
    return job.appointmentCount > 0 ? `${job.appointmentCount} appointment(s)` : 'Unscheduled';
  }

  const appointment = job.nextAppointment;
  const date = formatDate(appointment.scheduledDate) ?? 'Unscheduled';
  const start = appointment.scheduledStartTime ? ` ${appointment.scheduledStartTime}` : '';
  const tech = appointment.technicianName ? ` · ${appointment.technicianName}` : '';
  return `${date}${start}${tech}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function formatAgreementCoverage(agreement: CrmOperationalAgreementSummary): string {
  const locations =
    agreement.coveredLocationNames.length > 0
      ? agreement.coveredLocationNames.join(', ')
      : 'No locations listed';
  const equipment =
    agreement.coveredEquipmentCount > 0
      ? ` · ${agreement.coveredEquipmentCount} equipment item(s)`
      : '';
  return `${locations}${equipment}`;
}

function formatAgreementBilling(agreement: CrmOperationalAgreementSummary): string {
  if (agreement.billingCadence === 'none') {
    return 'No recurring billing';
  }

  const amount =
    agreement.billingAmount === undefined ? '' : `${formatCurrency(agreement.billingAmount)} `;
  const next = agreement.nextBillingDate ? ` · next ${formatDate(agreement.nextBillingDate)}` : '';
  return `${amount}${formatCamelStatus(agreement.billingCadence)}${next}`;
}

function formatDate(value: string | undefined): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatCamelStatus(value: string): string {
  return value.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase());
}
