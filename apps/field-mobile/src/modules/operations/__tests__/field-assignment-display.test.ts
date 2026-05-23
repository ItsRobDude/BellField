import { describe, expect, it } from 'vitest';
import {
  describeAppointmentAssignment,
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
    expect(describeAppointmentAssignment({ technicianId: currentEmployeeId }, currentEmployeeId)).toBe('You');
  });

  it('says "Another technician" when assigned to someone else but the name could not resolve', () => {
    expect(describeAppointmentAssignment({ technicianId: 'employee-2' }, currentEmployeeId)).toBe(
      'Another technician'
    );
  });
});

describe('isAppointmentAssignedToCurrentTechnician', () => {
  it('matches by technician id', () => {
    expect(isAppointmentAssignedToCurrentTechnician({ technicianId: currentEmployeeId }, currentEmployeeId)).toBe(true);
    expect(isAppointmentAssignedToCurrentTechnician({ technicianId: 'employee-2' }, currentEmployeeId)).toBe(false);
    expect(isAppointmentAssignedToCurrentTechnician({}, currentEmployeeId)).toBe(false);
  });
});
