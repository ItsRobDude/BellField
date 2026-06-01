import { defaultRoleTemplates } from './default-role-templates';

// Pins the deliberate invoice-permission policy calls so they can't silently regress.
describe('defaultRoleTemplates invoice permissions', () => {
  it('grants bookkeeping invoices:create so it can issue adjustment/credit corrections', () => {
    expect(defaultRoleTemplates.bookKeeping.permissions).toEqual(
      expect.arrayContaining(['invoices:view', 'invoices:create', 'invoices:edit', 'invoices:post'])
    );
  });

  it('grants owner invoices:post', () => {
    expect(defaultRoleTemplates.owner.permissions).toContain('invoices:post');
  });

  it('does not grant non-financial roles invoices:create', () => {
    expect(defaultRoleTemplates.csr.permissions).not.toContain('invoices:create');
    expect(defaultRoleTemplates.dispatcher.permissions).not.toContain('invoices:create');
    expect(defaultRoleTemplates.technician.permissions).not.toContain('invoices:create');
  });
});
