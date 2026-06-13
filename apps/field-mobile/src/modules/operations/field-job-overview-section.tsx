import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createBellFieldTranslator, type BellFieldLocale } from '@bellfield/i18n';
import { formatAppointmentSchedule, formatFieldLocationAddress } from './field-appointment-display';
import { formatAppointmentAssignmentLine } from './field-assignment-display';
import { openAddressInMaps, openPhoneNumber } from './field-contact-actions';
import { formatAppointmentStatusLabel } from './field-workspace-drafts';
import { selectFieldTimelineAppointment } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type {
  FieldAgreementCoverage,
  FieldCustomer,
  FieldJob,
  FieldLocation
} from './field-workspace-types';

type FieldJobOverviewSectionProps = {
  agreementCoverage: FieldAgreementCoverage[];
  currentEmployeeId: string;
  customer?: FieldCustomer;
  job: FieldJob;
  locale: BellFieldLocale;
  location?: FieldLocation;
};

type PhoneRow = {
  label: string;
  value: string;
};

export function FieldJobOverviewSection({
  agreementCoverage,
  currentEmployeeId,
  customer,
  job,
  locale,
  location
}: FieldJobOverviewSectionProps) {
  const t = createBellFieldTranslator(locale);
  const appointment = selectFieldTimelineAppointment(job, currentEmployeeId);
  const address = formatFieldLocationAddress(location, t);
  const phoneRows = buildPhoneRows(location, customer, t);

  return (
    <View style={localStyles.stack}>
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>{t('fieldOverview.jobContext')}</Text>
        <View style={localStyles.factGrid}>
          <Fact
            label={t('fieldOverview.customer')}
            value={customer?.name ?? job.billToCustomerName}
          />
          <Fact label={t('fieldOverview.location')} value={location?.name ?? job.locationName} />
        </View>
        {phoneRows.length > 0 ? (
          phoneRows.map((row) => (
            <Pressable
              key={`${row.label}-${row.value}`}
              onPress={() => void openPhoneNumber(row.value)}
              style={localStyles.tapRow}
            >
              <Text style={localStyles.rowLabel}>{row.label}</Text>
              <Text style={localStyles.rowValue}>{row.value}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.summaryText}>{t('fieldOverview.noPhoneNumbers')}</Text>
        )}
        <Pressable
          disabled={!location}
          onPress={() => void openAddressInMaps(address)}
          style={[localStyles.tapRow, !location ? localStyles.disabledTapRow : null]}
        >
          <Text style={localStyles.rowLabel}>{t('fieldOverview.serviceAddress')}</Text>
          <Text style={localStyles.rowValue}>{address}</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>{t('fieldOverview.workSummary')}</Text>
        {appointment ? (
          <>
            <Text style={styles.summaryText}>{formatAppointmentSchedule(appointment, t)}</Text>
            <Text style={styles.summaryText}>
              {formatAppointmentAssignmentLine(appointment, currentEmployeeId, t)}
            </Text>
            <Text style={styles.summaryText}>
              {t('fieldOverview.status')}: {formatAppointmentStatusLabel(appointment.status, t)}
            </Text>
          </>
        ) : (
          <Text style={styles.summaryText}>{t('fieldOverview.noActiveAppointment')}</Text>
        )}
        <Text style={localStyles.rowLabel}>{t('fieldOverview.officeNotes')}</Text>
        <Text style={localStyles.summaryValue}>{job.summary}</Text>
        <View style={localStyles.factGrid}>
          <Fact label={t('fieldOverview.type')} value={job.jobType} />
          <Fact label={t('fieldOverview.category')} value={job.category} />
          <Fact label={t('fieldOverview.origin')} value={job.origin} />
          {job.workOrderNumber ? (
            <Fact label={t('fieldOverview.workOrder')} value={job.workOrderNumber} />
          ) : null}
        </View>
      </View>

      {agreementCoverage.length > 0 ? (
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitleSmall}>{t('fieldOverview.serviceAgreements')}</Text>
          {agreementCoverage.map((agreement) => (
            <View key={agreement.agreementId} style={localStyles.agreementBlock}>
              <Text style={localStyles.rowValue}>
                {agreement.name} ({agreement.agreementNumber})
              </Text>
              <Text style={styles.summaryText}>{formatAgreementRenewalLine(agreement, t)}</Text>
              {agreement.description ? (
                <Text style={styles.summaryText}>{agreement.description}</Text>
              ) : null}
              <AgreementList
                items={agreement.coveredEquipment.map((record) => record.equipmentLabel)}
                label={t('fieldOverview.coveredEquipment')}
              />
              <AgreementList
                items={agreement.activeVisitTemplates.map((template) =>
                  formatVisitTemplateLine(template, t)
                )}
                label={t('fieldOverview.recurringService')}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={localStyles.fact}>
      <Text style={localStyles.rowLabel}>{label}</Text>
      <Text style={localStyles.rowValue}>{value}</Text>
    </View>
  );
}

function AgreementList({ items, label }: { items: string[]; label: string }) {
  const visibleItems = items.filter(Boolean);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <View style={localStyles.agreementList}>
      <Text style={localStyles.rowLabel}>{label}</Text>
      {visibleItems.map((item) => (
        <Text key={item} style={styles.summaryText}>
          {item}
        </Text>
      ))}
    </View>
  );
}

export function buildPhoneRows(
  location: FieldLocation | undefined,
  customer: FieldCustomer | undefined,
  t = createBellFieldTranslator('en')
): PhoneRow[] {
  const rows: PhoneRow[] = [];

  if (location?.phone) {
    rows.push({ label: t('fieldOverview.serviceLocation'), value: location.phone });
  }

  for (const contact of location?.contacts ?? []) {
    if (contact.isActive && contact.phone) {
      rows.push({ label: contact.displayName, value: contact.phone });
    }
  }

  if (customer?.phone && customer.id !== location?.customerId) {
    rows.push({ label: `${t('fieldWorkspace.billTo')}: ${customer.name}`, value: customer.phone });
  }

  return dedupePhoneRows(rows);
}

function dedupePhoneRows(rows: PhoneRow[]): PhoneRow[] {
  const seen = new Set<string>();
  const dedupedRows: PhoneRow[] = [];

  for (const row of rows) {
    const key = `${row.label}|${row.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      dedupedRows.push(row);
    }
  }

  return dedupedRows;
}

function formatAgreementRenewalLine(
  agreement: FieldAgreementCoverage,
  t = createBellFieldTranslator('en')
): string {
  return agreement.renewalDate
    ? `${t('fieldOverview.renewal')}: ${agreement.renewalDate}`
    : t('fieldOverview.noRenewalDate');
}

function formatVisitTemplateLine(
  template: FieldAgreementCoverage['activeVisitTemplates'][number],
  t = createBellFieldTranslator('en')
): string {
  const details = [
    formatVisitFrequency(template, t),
    template.timeWindowLabel,
    template.estimatedDurationMinutes
      ? `${template.estimatedDurationMinutes} ${t('fieldOverview.minutesEstimated')}`
      : undefined
  ].filter((entry): entry is string => Boolean(entry));
  const detailLine = details.length > 0 ? ` - ${details.join(', ')}` : '';

  return `${template.title}${detailLine}`;
}

function formatVisitFrequency(
  template: FieldAgreementCoverage['activeVisitTemplates'][number],
  t = createBellFieldTranslator('en')
): string {
  switch (template.frequency) {
    case 'monthly':
      return t('fieldOverview.frequency.monthly');
    case 'quarterly':
      return t('fieldOverview.frequency.quarterly');
    case 'semiAnnual':
      return t('fieldOverview.frequency.semiAnnual');
    case 'annual':
      return t('fieldOverview.frequency.annual');
    case 'custom':
      return template.intervalMonths
        ? `${t('fieldOverview.everyMonths')} ${template.intervalMonths} ${t(
            'fieldOverview.months'
          )}`
        : t('fieldOverview.customFrequency');
  }
}

const localStyles = StyleSheet.create({
  stack: { gap: 10 },
  tapRow: {
    backgroundColor: '#f7f8fb',
    borderColor: '#dfe5ef',
    borderRadius: 12,
    borderWidth: 1,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  disabledTapRow: { opacity: 0.55 },
  rowLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  rowValue: { color: '#0b1f44', fontSize: 15, fontWeight: '700', lineHeight: 21 },
  summaryValue: { color: '#0b1f44', fontSize: 16, fontWeight: '700', lineHeight: 23 },
  factGrid: { gap: 8 },
  fact: {
    backgroundColor: '#f7f8fb',
    borderRadius: 12,
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  agreementBlock: {
    borderColor: '#dfe5ef',
    borderTopWidth: 1,
    gap: 6,
    paddingTop: 10
  },
  agreementList: { gap: 3 }
});
