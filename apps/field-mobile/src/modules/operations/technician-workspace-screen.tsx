import { useEffect, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  addFieldJobNote,
  getAssignedFieldWork,
  updateFieldAppointmentStatus,
  updateFieldEquipment,
  type AppointmentStatus,
  type EquipmentStatus,
  type FieldAssignedWorkResponse
} from '@/lib/operations-api';
import type { EmployeeSummary } from '@/lib/identity-api';

type Props = {
  apiBaseUrl: string;
  employee: EmployeeSummary;
  sessionToken: string;
  onSignOut: () => void;
};

type PendingOperation =
  | { id: string; kind: 'jobNote'; jobId: string; note: string; occurredAt: string }
  | { id: string; kind: 'appointmentStatus'; appointmentId: string; status: AppointmentStatus; occurredAt: string }
  | { id: string; kind: 'equipmentUpdate'; equipmentId: string; status: EquipmentStatus; notes: string };

export function TechnicianWorkspaceScreen({ apiBaseUrl, employee, sessionToken, onSignOut }: Props) {
  const [assignedWork, setAssignedWork] = useState<FieldAssignedWorkResponse | null>(null);
  const [pendingOperations, setPendingOperations] = useState<PendingOperation[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [equipmentNoteDrafts, setEquipmentNoteDrafts] = useState<Record<string, string>>({});
  const [equipmentStatusDrafts, setEquipmentStatusDrafts] = useState<Record<string, EquipmentStatus>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const locationLookup = useMemo(
    () => new Map((assignedWork?.locations ?? []).map((location) => [location.id, location])),
    [assignedWork]
  );

  useEffect(() => {
    void refreshAssignedWork();
  }, []);

  async function refreshAssignedWork() {
    setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const nextAssignedWork = await getAssignedFieldWork({ sessionToken, apiBaseUrl });
      setAssignedWork(nextAssignedWork);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh assigned work.');
    } finally {
      setIsRefreshing(false);
    }
  }

  function queueJobNote(jobId: string) {
    const note = noteDrafts[jobId]?.trim();

    if (!note) {
      return;
    }

    const operation: PendingOperation = {
      id: `${jobId}-note-${Date.now()}`,
      kind: 'jobNote',
      jobId,
      note,
      occurredAt: new Date().toISOString()
    };

    setPendingOperations((current) => [...current, operation]);
    setNoteDrafts((current) => ({ ...current, [jobId]: '' }));
    applyLocalJobNote(jobId, note, operation.occurredAt);
  }

  function queueAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
    setPendingOperations((current) => [
      ...current,
      {
        id: `${appointmentId}-status-${Date.now()}`,
        kind: 'appointmentStatus',
        appointmentId,
        status,
        occurredAt: new Date().toISOString()
      }
    ]);
    applyLocalAppointmentStatus(appointmentId, status);
  }

  function queueEquipmentUpdate(equipmentId: string) {
    const nextStatus = equipmentStatusDrafts[equipmentId] ?? 'active';
    const nextNotes = equipmentNoteDrafts[equipmentId] ?? '';

    setPendingOperations((current) => [
      ...current,
      {
        id: `${equipmentId}-equipment-${Date.now()}`,
        kind: 'equipmentUpdate',
        equipmentId,
        status: nextStatus,
        notes: nextNotes
      }
    ]);

    applyLocalEquipmentUpdate(equipmentId, nextStatus, nextNotes);
  }

  function applyLocalJobNote(jobId: string, note: string, occurredAt: string) {
    setAssignedWork((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        jobs: current.jobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                timeline: [
                  ...job.timeline,
                  {
                    id: `${jobId}-local-note-${occurredAt}`,
                    occurredAt,
                    actorName: employee.displayName,
                    message: note,
                    kind: 'jobNote'
                  }
                ]
              }
            : job
        )
      };
    });
  }

  function applyLocalAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
    setAssignedWork((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        jobs: current.jobs.map((job) => ({
          ...job,
          appointments: job.appointments.map((appointment) =>
            appointment.id === appointmentId ? { ...appointment, status } : appointment
          )
        }))
      };
    });
  }

  function applyLocalEquipmentUpdate(equipmentId: string, status: EquipmentStatus, notes: string) {
    setAssignedWork((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        equipment: current.equipment.map((record) =>
          record.id === equipmentId
            ? {
                ...record,
                status,
                notes
              }
            : record
        )
      };
    });
  }

  async function syncNow() {
    setIsSyncing(true);
    setErrorMessage(null);

    try {
      const operationsToSync = [...pendingOperations];

      for (let index = 0; index < operationsToSync.length; index += 1) {
        const operation = operationsToSync[index];

        if (operation.kind === 'jobNote') {
          await addFieldJobNote({
            sessionToken,
            apiBaseUrl,
            jobId: operation.jobId,
            note: operation.note,
            occurredAt: operation.occurredAt
          });
        }

        if (operation.kind === 'appointmentStatus') {
          await updateFieldAppointmentStatus({
            sessionToken,
            apiBaseUrl,
            appointmentId: operation.appointmentId,
            status: operation.status,
            occurredAt: operation.occurredAt
          });
        }

        if (operation.kind === 'equipmentUpdate') {
          await updateFieldEquipment({
            sessionToken,
            apiBaseUrl,
            equipmentId: operation.equipmentId,
            status: operation.status,
            notes: operation.notes
          });
        }

        setPendingOperations(operationsToSync.slice(index + 1));
      }

      await refreshAssignedWork();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sync queued field work.');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.kicker}>BellField Field</Text>
          <Text style={styles.title}>{employee.displayName}</Text>
          <Text style={styles.subtitle}>
            Assigned jobs are cached in app state first, saved work is queued locally, and Sync Now replays those
            changes back to the server. Durable device persistence is still the next layer after this foundation.
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Sync foundation</Text>
            <Text style={styles.summaryText}>Pending local saves: {pendingOperations.length}</Text>
            <Text style={styles.summaryText}>Server snapshot: {assignedWork?.serverTime ?? 'Not loaded yet'}</Text>
            <Text style={styles.summaryText}>Scope: today and tomorrow assigned jobs</Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable onPress={() => void refreshAssignedWork()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh jobs'}</Text>
            </Pressable>
            <Pressable onPress={() => void syncNow()} style={styles.primaryButton}>
              {isSyncing ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Sync Now</Text>}
            </Pressable>
            <Pressable onPress={onSignOut} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </View>

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          {(assignedWork?.jobs ?? []).map((job) => {
            const location = locationLookup.get(job.locationId);
            const equipment = (assignedWork?.equipment ?? []).filter((record) => record.locationId === job.locationId);

            return (
              <View key={job.id} style={styles.summaryCard}>
                <Text style={styles.sectionTitle}>
                  Job {job.jobNumber}: {job.summary}
                </Text>
                <Text style={styles.summaryText}>
                  {location?.name} - {location?.addressLine1} - {job.billToCustomerName}
                </Text>
                <Text style={styles.summaryText}>
                  Contacts: {location?.contacts.map((contact) => contact.displayName).join(', ') || 'None'}
                </Text>

                {job.appointments.map((appointment) => (
                  <View key={appointment.id} style={styles.block}>
                    <Text style={styles.sectionTitleSmall}>
                      {appointment.scheduledDate || 'Unscheduled'} - {appointment.timeWindowLabel || 'No window'}
                    </Text>
                    <Text style={styles.summaryText}>{appointment.technicianName || employee.displayName}</Text>
                    <View style={styles.actionRow}>
                      {(['assigned', 'arrived', 'working', 'finished'] as AppointmentStatus[]).map((status) => (
                        <Pressable
                          key={status}
                          onPress={() => queueAppointmentStatus(appointment.id, status)}
                          style={styles.tagButton}
                        >
                          <Text style={styles.tagButtonText}>{status}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}

                <View style={styles.block}>
                  <Text style={styles.sectionTitleSmall}>Save note locally</Text>
                  <TextInput
                    value={noteDrafts[job.id] ?? ''}
                    onChangeText={(value) => setNoteDrafts((current) => ({ ...current, [job.id]: value }))}
                    multiline
                    placeholder="Add visit notes that should queue until sync."
                    style={styles.input}
                  />
                  <Pressable onPress={() => queueJobNote(job.id)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Save note locally</Text>
                  </Pressable>
                </View>

                {equipment.map((record) => (
                  <View key={record.id} style={styles.block}>
                    <Text style={styles.sectionTitleSmall}>
                      {record.equipmentType}: {record.brand} {record.model}
                    </Text>
                    <Text style={styles.summaryText}>Serial: {record.serialNumber}</Text>
                    <View style={styles.actionRow}>
                      {(['active', 'pendingInstall', 'inactive'] as EquipmentStatus[]).map((status) => (
                        <Pressable
                          key={status}
                          onPress={() => setEquipmentStatusDrafts((current) => ({ ...current, [record.id]: status }))}
                          style={styles.tagButton}
                        >
                          <Text style={styles.tagButtonText}>{status}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <TextInput
                      value={equipmentNoteDrafts[record.id] ?? record.notes}
                      onChangeText={(value) => setEquipmentNoteDrafts((current) => ({ ...current, [record.id]: value }))}
                      multiline
                      style={styles.input}
                    />
                    <Pressable onPress={() => queueEquipmentUpdate(record.id)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Save equipment locally</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}

          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>Pending queue</Text>
            {pendingOperations.length === 0 ? (
              <Text style={styles.summaryText}>No local changes waiting for sync.</Text>
            ) : (
              pendingOperations.map((operation) => (
                <Text key={operation.id} style={styles.summaryText}>
                  {operation.kind}
                </Text>
              ))
            )}
          </View>
        </View>
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2efe6' },
  scrollContent: { flexGrow: 1, padding: 20 },
  card: {
    backgroundColor: '#fffdf8',
    borderColor: '#e4d6bc',
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    padding: 20
  },
  kicker: { color: '#936327', fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: '#1f2933', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#52606d', fontSize: 15, lineHeight: 22 },
  summaryCard: { backgroundColor: '#ffffff', borderColor: '#ebdec6', borderRadius: 18, borderWidth: 1, gap: 8, padding: 16 },
  block: { backgroundColor: '#faf7ef', borderRadius: 14, gap: 8, padding: 12 },
  sectionTitle: { color: '#1f2933', fontSize: 17, fontWeight: '600' },
  sectionTitleSmall: { color: '#1f2933', fontSize: 15, fontWeight: '600' },
  summaryText: { color: '#52606d', fontSize: 14, lineHeight: 20 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#d9c8ad',
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top'
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#1c6b57', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 12 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: '#cdbfa6', borderRadius: 999, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  secondaryButtonText: { color: '#1f2933', fontSize: 14, fontWeight: '600' },
  tagButton: { backgroundColor: '#eef2e5', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tagButtonText: { color: '#33523d', fontSize: 13, fontWeight: '600' },
  errorText: { color: '#b42318', fontSize: 14 }
});
