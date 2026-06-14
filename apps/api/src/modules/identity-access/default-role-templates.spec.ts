import { defaultRoleTemplates } from './default-role-templates';

// Pins the deliberate invoice-permission policy calls so they can't silently regress.
describe('defaultRoleTemplates invoice permissions', () => {
  it('grants bookkeeping invoices:create so it can issue adjustment/credit corrections', () => {
    expect(defaultRoleTemplates.bookKeeping.permissions).toEqual(
      expect.arrayContaining([
        'invoices:view',
        'invoices:create',
        'invoices:edit',
        'invoices:post',
        'invoices:send'
      ])
    );
  });

  it('grants owner and admin invoice send/post permissions', () => {
    expect(defaultRoleTemplates.owner.permissions).toContain('invoices:post');
    expect(defaultRoleTemplates.owner.permissions).toContain('invoices:send');
    expect(defaultRoleTemplates.admin.permissions).toContain('invoices:post');
    expect(defaultRoleTemplates.admin.permissions).toContain('invoices:send');
  });

  it('does not grant non-financial roles invoice create/send permissions', () => {
    expect(defaultRoleTemplates.csr.permissions).not.toContain('invoices:create');
    expect(defaultRoleTemplates.csr.permissions).not.toContain('invoices:send');
    expect(defaultRoleTemplates.dispatcher.permissions).not.toContain('invoices:create');
    expect(defaultRoleTemplates.dispatcher.permissions).not.toContain('invoices:send');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('invoices:create');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('invoices:send');
  });
});

// Job cost is internal financial data, gated on its own jobCosting area (not jobs:edit).
describe('defaultRoleTemplates jobCosting permissions', () => {
  it('grants owner, admin, and bookkeeping jobCosting view/create/edit', () => {
    for (const role of ['owner', 'admin', 'bookKeeping'] as const) {
      expect(defaultRoleTemplates[role].permissions).toEqual(
        expect.arrayContaining(['jobCosting:view', 'jobCosting:create', 'jobCosting:edit'])
      );
    }
  });

  it('does not grant scheduling/field roles jobCosting create/edit (cost entry or correction)', () => {
    for (const role of ['csr', 'dispatcher', 'technician'] as const) {
      expect(defaultRoleTemplates[role].permissions).not.toContain('jobCosting:create');
      expect(defaultRoleTemplates[role].permissions).not.toContain('jobCosting:edit');
    }
  });
});

// History/Audit is a cross-record, owner/admin-only trust surface (M10 slice 2). Pin the gate so a
// future template edit can't silently widen who can read everyone's activity.
describe('defaultRoleTemplates history permissions', () => {
  it('grants history:view to owner and admin only', () => {
    expect(defaultRoleTemplates.owner.permissions).toContain('history:view');
    expect(defaultRoleTemplates.admin.permissions).toContain('history:view');
  });

  it('does not grant history:view to any other role', () => {
    for (const role of ['csr', 'dispatcher', 'bookKeeping', 'technician'] as const) {
      expect(defaultRoleTemplates[role].permissions).not.toContain('history:view');
    }
  });
});

describe('defaultRoleTemplates catalog permissions', () => {
  it('grants office roles catalog view/create/edit for pricebook maintenance', () => {
    for (const role of ['owner', 'admin', 'csr', 'dispatcher', 'bookKeeping'] as const) {
      expect(defaultRoleTemplates[role].permissions).toEqual(
        expect.arrayContaining(['catalog:view', 'catalog:create', 'catalog:edit'])
      );
    }
  });

  it('keeps technician catalog access read-only', () => {
    expect(defaultRoleTemplates.technician.permissions).toContain('catalog:view');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('catalog:create');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('catalog:edit');
  });
});

describe('defaultRoleTemplates estimate send permissions', () => {
  it('grants estimate sending to owner and admin by default', () => {
    expect(defaultRoleTemplates.owner.permissions).toContain('estimates:send');
    expect(defaultRoleTemplates.admin.permissions).toContain('estimates:send');
  });

  it('does not grant estimate sending to office, bookkeeping, or field roles by default', () => {
    for (const role of ['csr', 'dispatcher', 'bookKeeping', 'technician'] as const) {
      expect(defaultRoleTemplates[role].permissions).not.toContain('estimates:send');
    }
  });
});

describe('defaultRoleTemplates agreement permissions', () => {
  it('grants office roles agreement view/create/edit for agreement lifecycle work', () => {
    for (const role of ['owner', 'admin', 'csr', 'dispatcher', 'bookKeeping'] as const) {
      expect(defaultRoleTemplates[role].permissions).toEqual(
        expect.arrayContaining(['agreements:view', 'agreements:create', 'agreements:edit'])
      );
    }
  });

  it('keeps technician agreement access read-only for field coverage context', () => {
    expect(defaultRoleTemplates.technician.permissions).toContain('agreements:view');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('agreements:create');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('agreements:edit');
  });
});
