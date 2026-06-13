import type {
  AppointmentFinishOutcome,
  EquipmentMutationResponse,
  FieldAssignedWorkResponse,
  JobMutationResponse,
  RegisterEntrySummary
} from '@/lib/operations-api';
import { createBellFieldTranslator, type BellFieldTranslator } from '@bellfield/i18n';
import type { AssignedWorkSnapshot, PendingOperation } from './field-sync-types';
import { formatAppointmentStatusLabel } from './field-workspace-drafts';

const defaultTranslator = createBellFieldTranslator('en');

export function applyPendingOperations(
  snapshot: AssignedWorkSnapshot | null,
  pendingOperations: PendingOperation[],
  actorName: string,
  t: BellFieldTranslator = defaultTranslator
): FieldAssignedWorkResponse | null {
  if (!snapshot) {
    return null;
  }

  let nextSnapshot: FieldAssignedWorkResponse = {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => ({
      ...job,
      appointments: job.appointments.map((appointment) => ({ ...appointment })),
      registerEntries: job.registerEntries?.map((entry) => ({ ...entry })),
      timeline: job.timeline.map((entry) => ({ ...entry }))
    })),
    locations: snapshot.locations.map((location) => ({
      ...location,
      contacts: location.contacts.map((contact) => ({ ...contact }))
    })),
    customers: snapshot.customers.map((customer) => ({ ...customer })),
    equipment: snapshot.equipment.map((record) => ({ ...record })),
    catalogItems: snapshot.catalogItems.map((item) => ({
      ...item,
      tradeTags: [...item.tradeTags]
    })),
    agreementCoverage: (snapshot.agreementCoverage ?? []).map((agreement) => ({
      ...agreement,
      coveredLocations: agreement.coveredLocations.map((location) => ({ ...location })),
      coveredEquipment: agreement.coveredEquipment.map((record) => ({ ...record })),
      activeVisitTemplates: agreement.activeVisitTemplates.map((template) => ({ ...template }))
    }))
  };

  for (const operation of pendingOperations) {
    if (operation.kind === 'jobNote') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: operation.note,
                    kind: 'jobNote'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'appointmentStatus') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) => ({
          ...job,
          appointments: job.appointments.map((appointment) =>
            appointment.id === operation.appointmentId
              ? { ...appointment, status: operation.status }
              : appointment
          )
        }))
      };
    }

    if (operation.kind === 'appointmentFinishReview') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) => ({
          ...job,
          needsOfficeReview:
            job.id === findJobIdForAppointment(nextSnapshot, operation.appointmentId)
              ? true
              : job.needsOfficeReview,
          appointments: job.appointments.map((appointment) =>
            appointment.id === operation.appointmentId
              ? {
                  ...appointment,
                  status: operation.status,
                  finishOutcome: operation.finishOutcome,
                  visitNotes: operation.visitNotes,
                  hasChargeActivity: operation.hasChargeActivity,
                  registerFollowUpNote: operation.registerFollowUpNote,
                  needsOfficeReview: true
                }
              : appointment
          ),
          timeline:
            job.id === findJobIdForAppointment(nextSnapshot, operation.appointmentId)
              ? [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-finish`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `${t('fieldQueue.finishReviewSavedLocallyWithOutcome')} ${formatFinishOutcome(operation.finishOutcome, t)}.`,
                    kind: 'appointmentFinishedReview'
                  }
                ]
              : job.timeline
        }))
      };
    }

    if (operation.kind === 'equipmentUpdate') {
      nextSnapshot = {
        ...nextSnapshot,
        equipment: nextSnapshot.equipment.map((record) =>
          record.id === operation.equipmentId
            ? {
                ...record,
                model: operation.model ?? record.model,
                serialNumber: operation.serialNumber ?? record.serialNumber,
                filterSizes: operation.filterSizes ?? record.filterSizes,
                equipmentLocationDescription:
                  operation.equipmentLocationDescription ?? record.equipmentLocationDescription,
                installDate: operation.installDate ?? record.installDate,
                status: operation.status,
                notes: operation.notes
              }
            : record
        )
      };
    }

    if (operation.kind === 'registerEntryCreate') {
      const localEntry = buildLocalRegisterEntry(operation, actorName);
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                registerEntries: [...(job.registerEntries ?? []), localEntry],
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-register`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `${t('fieldQueue.registerEntrySavedLocally')}: ${operation.description}.`,
                    kind: 'registerEntryAdded'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'registerEntryEdit') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                registerEntries: (job.registerEntries ?? []).map((entry) =>
                  entry.id === operation.registerEntryId
                    ? applyRegisterEntryEdit(entry, operation)
                    : entry
                ),
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-register-edit`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `${t('fieldQueue.registerEntryEditSavedLocally')}: ${
                      operation.description ?? operation.registerEntryId
                    }.`,
                    kind: 'registerEntryEdited'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'registerEntryVoid') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                registerEntries: (job.registerEntries ?? []).map((entry) =>
                  entry.id === operation.registerEntryId
                    ? {
                        ...entry,
                        isVoid: true,
                        voidReason: operation.reason,
                        updatedAt: operation.occurredAt
                      }
                    : entry
                ),
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-register-void`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `${t('fieldQueue.registerEntryVoidSavedLocally')}${
                      operation.reason ? `: ${operation.reason}` : '.'
                    }`,
                    kind: 'registerEntryVoided'
                  }
                ]
              }
            : job
        )
      };
    }

    if (operation.kind === 'mediaUpload') {
      nextSnapshot = {
        ...nextSnapshot,
        jobs: nextSnapshot.jobs.map((job) =>
          job.id === operation.jobId
            ? {
                ...job,
                timeline: [
                  ...job.timeline,
                  {
                    id: `${operation.id}-local-media`,
                    occurredAt: operation.occurredAt,
                    actorName,
                    message: `${t('fieldQueue.mediaQueuedLocally')}: ${operation.originalFilename}.`,
                    kind: 'mediaAttached'
                  }
                ]
              }
            : job
        )
      };
    }
  }

  return nextSnapshot;
}

export function mergeJobMutationIntoAssignedWork(
  snapshot: AssignedWorkSnapshot,
  response: JobMutationResponse
): AssignedWorkSnapshot {
  const { syncResult: _syncResult, warningMessages: _warningMessages, ...jobSummary } = response;
  const hasJob = snapshot.jobs.some((job) => job.id === jobSummary.id);

  if (!hasJob) {
    return snapshot;
  }

  return {
    ...snapshot,
    jobs: snapshot.jobs.map((job) => (job.id === jobSummary.id ? jobSummary : job))
  };
}

export function mergeEquipmentMutationIntoAssignedWork(
  snapshot: AssignedWorkSnapshot,
  response: EquipmentMutationResponse
): AssignedWorkSnapshot {
  const {
    history: _history,
    replacedByEquipment: _replacedByEquipment,
    replacesEquipment: _replacesEquipment,
    ...equipmentSummary
  } = response.equipment;
  const hasEquipment = snapshot.equipment.some((record) => record.id === equipmentSummary.id);

  if (!hasEquipment) {
    return snapshot;
  }

  return {
    ...snapshot,
    equipment: snapshot.equipment.map((record) =>
      record.id === equipmentSummary.id ? equipmentSummary : record
    )
  };
}

export function findJobIdForAppointment(
  snapshot: FieldAssignedWorkResponse,
  appointmentId: string
): string | undefined {
  return snapshot.jobs.find((job) =>
    job.appointments.some((appointment) => appointment.id === appointmentId)
  )?.id;
}

export function findAppointmentBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  appointmentId: string
): string | undefined {
  return snapshot?.jobs
    .flatMap((job) => job.appointments)
    .find((appointment) => appointment.id === appointmentId)?.updatedAt;
}

export function findJobBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  jobId: string
): string | undefined {
  return snapshot?.jobs.find((job) => job.id === jobId)?.updatedAt;
}

export function findEquipmentBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  equipmentId: string
): string | undefined {
  return snapshot?.equipment.find((record) => record.id === equipmentId)?.updatedAt;
}

export function findRegisterEntryBaseUpdatedAt(
  snapshot: AssignedWorkSnapshot | null,
  registerEntryId: string
): string | undefined {
  return snapshot?.jobs
    .flatMap((job) => job.registerEntries ?? [])
    .find((registerEntry) => registerEntry.id === registerEntryId)?.updatedAt;
}

export function formatFinishOutcome(
  value: AppointmentFinishOutcome,
  t: BellFieldTranslator = defaultTranslator
): string {
  if (value === 'followUpNeeded') {
    return t('fieldFinishReview.outcome.followUpNeeded');
  }

  if (value === 'noAccess') {
    return t('fieldFinishReview.outcome.noAccess');
  }

  return t('fieldFinishReview.outcome.completed');
}

export function formatPendingOperation(
  operation: PendingOperation,
  t: BellFieldTranslator = defaultTranslator
): string {
  const stateSuffix =
    operation.state === 'pending'
      ? t('fieldQueue.state.pendingSync')
      : operation.state === 'conflict'
        ? `${t('fieldQueue.state.conflict')}${
            operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''
          }`
        : `${t('fieldQueue.state.rejected')}${
            operation.lastResultMessage ? `: ${operation.lastResultMessage}` : ''
          }`;

  if (operation.kind === 'jobNote') {
    return `${t('fieldQueue.jobNoteSavedLocallyAt')} ${new Date(
      operation.occurredAt
    ).toLocaleTimeString()} (${stateSuffix})`;
  }

  if (operation.kind === 'appointmentStatus') {
    return `${t('fieldQueue.appointmentStatusQueued')}: ${formatAppointmentStatusLabel(
      operation.status,
      t
    )} (${stateSuffix})`;
  }

  if (operation.kind === 'appointmentFinishReview') {
    return `${t('fieldQueue.finishReviewQueued')}: ${formatFinishOutcome(
      operation.finishOutcome,
      t
    )} (${stateSuffix})`;
  }

  if (operation.kind === 'registerEntryCreate') {
    return `${t('fieldQueue.registerEntryQueued')}: ${operation.description} (${stateSuffix})`;
  }

  if (operation.kind === 'registerEntryEdit') {
    return `${t('fieldQueue.registerEntryEditQueued')}: ${
      operation.description ?? operation.registerEntryId
    } (${stateSuffix})`;
  }

  if (operation.kind === 'registerEntryVoid') {
    return `${t('fieldQueue.registerEntryVoidQueued')}${
      operation.reason ? `: ${operation.reason}` : ''
    } (${stateSuffix})`;
  }

  if (operation.kind === 'mediaUpload') {
    return `${t('fieldQueue.mediaUploadQueued')}: ${operation.originalFilename} (${stateSuffix})`;
  }

  return `${t('fieldQueue.equipmentUpdateQueued')}: ${operation.status} (${stateSuffix})`;
}

type RegisterEntryCreateOperation = Extract<PendingOperation, { kind: 'registerEntryCreate' }>;
type RegisterEntryEditOperation = Extract<PendingOperation, { kind: 'registerEntryEdit' }>;

function buildLocalRegisterEntry(
  operation: RegisterEntryCreateOperation,
  actorName: string
): RegisterEntrySummary {
  return {
    id: `${operation.id}-local`,
    jobId: operation.jobId,
    appointmentId: operation.appointmentId,
    kind: operation.registerEntryKind,
    description: operation.description,
    quantity: operation.quantity,
    unitOfMeasure: operation.unitOfMeasure,
    unitPrice: operation.unitPrice,
    totalAmount: operation.totalAmount,
    partNumber: operation.partNumber,
    inventorySourceLabel: operation.inventorySourceLabel,
    inventoryItemId: operation.inventoryItemId,
    inventoryLocationId: operation.inventoryLocationId,
    catalogItemId: operation.catalogItemId,
    catalogSnapshot: operation.catalogSnapshot,
    // Optimistic local default: billable + uncosted. Even when the tech picked structured truck
    // stock we cannot know offline whether on-hand was sufficient, so the real costing status
    // (applied vs needsResolution) only arrives when the server processes this on sync.
    billingProjectionState: 'billable',
    costingStatus: 'notCosted',
    capturedByEmployeeId: 'local-device',
    capturedByName: actorName,
    capturedAt: operation.occurredAt,
    isVoid: false,
    createdAt: operation.occurredAt,
    updatedAt: operation.occurredAt
  };
}

function applyRegisterEntryEdit(
  entry: RegisterEntrySummary,
  operation: RegisterEntryEditOperation
): RegisterEntrySummary {
  return {
    ...entry,
    appointmentId:
      operation.appointmentId !== undefined
        ? (operation.appointmentId ?? undefined)
        : entry.appointmentId,
    kind: operation.registerEntryKind ?? entry.kind,
    description: operation.description ?? entry.description,
    quantity: operation.quantity ?? entry.quantity,
    unitOfMeasure:
      operation.unitOfMeasure !== undefined
        ? operation.unitOfMeasure || undefined
        : entry.unitOfMeasure,
    unitPrice:
      operation.unitPrice !== undefined ? (operation.unitPrice ?? undefined) : entry.unitPrice,
    totalAmount: operation.totalAmount ?? entry.totalAmount,
    partNumber:
      operation.partNumber !== undefined ? operation.partNumber || undefined : entry.partNumber,
    inventorySourceLabel:
      operation.inventorySourceLabel !== undefined
        ? operation.inventorySourceLabel || undefined
        : entry.inventorySourceLabel,
    updatedAt: operation.occurredAt
  };
}
