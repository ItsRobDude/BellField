import { describe, expect, it } from 'vitest';
import { createBellFieldTranslator } from '@bellfield/i18n';
import {
  buildAppointmentOwnershipWarning,
  describeAppointmentAssignment,
  formatAppointmentAssignmentLine,
  shouldConfirmAppointmentOwnership,
  isAppointmentAssignedToCurrentTechnician
} from '../field-assignment-display';

const currentEmployeeId = 'employee-1';

describe('describeAppointmentAssignment', () => {
  it('prefers the resolved technician name when the snapshot already has it', () => {
    expect(
      describeAppointmentAssignment(
        { technicianId: 'employee-2', technicianName: 'Sam Tech' },
        currentEmployeeId
      )
    ).toBe('Sam Tech');
  });

  it('says "Unassigned" when there is no technicianId at all (no falling back to the current employee)', () => {
    expect(describeAppointmentAssignment({}, currentEmployeeId)).toBe('Unassigned');
  });

  it('says "You" when the unresolved technician id is the current employee', () => {
    expect(
      describeAppointmentAssignment({ technicianId: currentEmployeeId }, currentEmployeeId)
    ).toBe('You');
  });

  it('says "Another technician" when assigned to someone else but the name could not resolve', () => {
    expect(describeAppointmentAssignment({ technicianId: 'employee-2' }, currentEmployeeId)).toBe(
      'Another technician'
    );
  });
});

describe('isAppointmentAssignedToCurrentTechnician', () => {
  it('matches by technician id', () => {
    expect(
      isAppointmentAssignedToCurrentTechnician(
        { technicianId: currentEmployeeId },
        currentEmployeeId
      )
    ).toBe(true);
    expect(
      isAppointmentAssignedToCurrentTechnician({ technicianId: 'employee-2' }, currentEmployeeId)
    ).toBe(false);
    expect(isAppointmentAssignedToCurrentTechnician({}, currentEmployeeId)).toBe(false);
  });
});

describe('formatAppointmentAssignmentLine', () => {
  it('avoids duplicate you-copy when the current technician name is unresolved', () => {
    expect(
      formatAppointmentAssignmentLine({ technicianId: currentEmployeeId }, currentEmployeeId)
    ).toBe('Assigned to you');
  });

  it('shows the resolved current technician name when available', () => {
    expect(
      formatAppointmentAssignmentLine(
        { technicianId: currentEmployeeId, technicianName: 'Taylor Tech' },
        currentEmployeeId
      )
    ).toBe('Assigned to you (Taylor Tech)');
  });

  it('keeps unassigned appointments plainly labeled', () => {
    expect(formatAppointmentAssignmentLine({}, currentEmployeeId)).toBe('Unassigned');
  });

  it('uses the selected translator for assignment labels', () => {
    const t = createBellFieldTranslator('es');

    expect(formatAppointmentAssignmentLine({}, currentEmployeeId, t)).toBe('Sin asignar');
    expect(
      formatAppointmentAssignmentLine({ technicianId: currentEmployeeId }, currentEmployeeId, t)
    ).toBe('Asignado a ti');
    expect(
      formatAppointmentAssignmentLine({ technicianId: 'employee-2' }, currentEmployeeId, t)
    ).toBe('Asignado a Otro técnico');
  });
});

describe('appointment ownership confirmations', () => {
  it('requires confirmation for unassigned or other-technician appointments', () => {
    expect(shouldConfirmAppointmentOwnership({}, currentEmployeeId)).toBe(true);
    expect(
      shouldConfirmAppointmentOwnership({ technicianId: 'employee-2' }, currentEmployeeId)
    ).toBe(true);
    expect(
      shouldConfirmAppointmentOwnership({ technicianId: currentEmployeeId }, currentEmployeeId)
    ).toBe(false);
  });

  it('builds a clear warning for non-owned appointment changes', () => {
    expect(buildAppointmentOwnershipWarning({}, currentEmployeeId, 'marking it working')).toBe(
      'This appointment is currently unassigned. Continue with marking it working?'
    );
    expect(
      buildAppointmentOwnershipWarning(
        { technicianId: 'employee-2', technicianName: 'Sam Tech' },
        currentEmployeeId,
        'marking it finished'
      )
    ).toBe('This appointment is assigned to Sam Tech. Continue with marking it finished?');
  });

  it('uses the selected translator for ownership warnings', () => {
    const t = createBellFieldTranslator('es');

    expect(
      buildAppointmentOwnershipWarning({}, currentEmployeeId, 'marcarla como trabajando', t)
    ).toBe('Esta cita no tiene técnico asignado. ¿Continuar con marcarla como trabajando?');
  });
});
