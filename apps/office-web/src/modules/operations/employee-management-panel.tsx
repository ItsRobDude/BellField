import { officeWorkspaceStyles as styles } from './office-workspace-styles';
import type { EmployeeRoleId, EmployeeSummary, RoleTemplate } from '@/lib/identity-api';

type EmployeeManagementPanelProps = {
  employees: EmployeeSummary[];
  roles: RoleTemplate[];
  onEmployeeUpdate: (
    employeeId: string,
    roleId: EmployeeRoleId,
    isActive: boolean
  ) => Promise<void>;
};

export function EmployeeManagementPanel({
  employees,
  roles,
  onEmployeeUpdate
}: EmployeeManagementPanelProps) {
  return (
    <section style={styles.card}>
      <h2 style={styles.heading}>Employees</h2>
      <div style={styles.grid}>
        {employees.map((managedEmployee) => (
          <article key={managedEmployee.id} style={styles.panel}>
            <strong>{managedEmployee.displayName}</strong>
            <div style={styles.muted}>{managedEmployee.email}</div>
            <select
              value={managedEmployee.roleId}
              onChange={(event) =>
                void onEmployeeUpdate(
                  managedEmployee.id,
                  event.target.value as EmployeeRoleId,
                  managedEmployee.isActive
                )
              }
              style={styles.input}
            >
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <label style={styles.inlineLabel}>
              <input
                type="checkbox"
                checked={managedEmployee.isActive}
                onChange={(event) =>
                  void onEmployeeUpdate(
                    managedEmployee.id,
                    managedEmployee.roleId,
                    event.target.checked
                  )
                }
              />
              Active
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
