import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatAppointmentSchedule, formatFieldLocationAddress } from './field-appointment-display';
import { formatAppointmentAssignmentLine } from './field-assignment-display';
import { openAddressInMaps, openPhoneNumber } from './field-contact-actions';
import { formatAppointmentStatusLabel } from './field-workspace-drafts';
import { selectFieldTimelineAppointment } from './field-workspace-layout';
import { fieldWorkspaceStyles as styles } from './field-workspace-styles';
import type { FieldCustomer, FieldJob, FieldLocation } from './field-workspace-types';

type FieldJobOverviewSectionProps = {
  currentEmployeeId: string;
  customer?: FieldCustomer;
  job: FieldJob;
  location?: FieldLocation;
};

type PhoneRow = {
  label: string;
  value: string;
};

export function FieldJobOverviewSection({
  currentEmployeeId,
  customer,
  job,
  location
}: FieldJobOverviewSectionProps) {
  const appointment = selectFieldTimelineAppointment(job, currentEmployeeId);
  const address = formatFieldLocationAddress(location);
  const phoneRows = buildPhoneRows(location, customer);

  return (
    <View style={localStyles.stack}>
      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>Who</Text>
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
          <Text style={styles.summaryText}>No phone numbers recorded for this location.</Text>
        )}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>Where</Text>
        <Text style={styles.summaryText}>{location?.name ?? job.locationName}</Text>
        <Pressable
          disabled={!location}
          onPress={() => void openAddressInMaps(address)}
          style={[localStyles.tapRow, !location ? localStyles.disabledTapRow : null]}
        >
          <Text style={localStyles.rowLabel}>Service address</Text>
          <Text style={localStyles.rowValue}>{address}</Text>
        </Pressable>
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>When</Text>
        {appointment ? (
          <>
            <Text style={styles.summaryText}>{formatAppointmentSchedule(appointment)}</Text>
            <Text style={styles.summaryText}>
              {formatAppointmentAssignmentLine(appointment, currentEmployeeId)}
            </Text>
            <Text style={styles.summaryText}>
              Status: {formatAppointmentStatusLabel(appointment.status)}
            </Text>
          </>
        ) : (
          <Text style={styles.summaryText}>No active appointment is scheduled for this job.</Text>
        )}
      </View>

      <View style={styles.summaryCard}>
        <Text style={styles.sectionTitleSmall}>What</Text>
        <Text style={localStyles.rowLabel}>Office notes</Text>
        <Text style={localStyles.summaryValue}>{job.summary}</Text>
        <View style={localStyles.factGrid}>
          <Fact label="Type" value={job.jobType} />
          <Fact label="Category" value={job.category} />
          <Fact label="Origin" value={job.origin} />
          {job.workOrderNumber ? <Fact label="Work order" value={job.workOrderNumber} /> : null}
        </View>
      </View>
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

export function buildPhoneRows(
  location: FieldLocation | undefined,
  customer: FieldCustomer | undefined
): PhoneRow[] {
  const rows: PhoneRow[] = [];

  if (location?.phone) {
    rows.push({ label: 'Service location', value: location.phone });
  }

  for (const contact of location?.contacts ?? []) {
    if (contact.isActive && contact.phone) {
      rows.push({ label: contact.displayName, value: contact.phone });
    }
  }

  if (customer?.phone && customer.id !== location?.customerId) {
    rows.push({ label: `Bill to: ${customer.name}`, value: customer.phone });
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
  }
});
