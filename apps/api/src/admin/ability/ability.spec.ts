import { can, permissionsFor } from './ability';

describe('admin ability (port of Rails Ability)', () => {
  it('lets Admin manage everything, case-insensitively', () => {
    expect(can('Admin', 'manage', 'admin_users')).toBe(true);
    expect(can('admin', 'manage', 'anything')).toBe(true);
  });

  it('limits sub_admin to its manage and read lists', () => {
    expect(can('sub_admin', 'manage', 'roles')).toBe(true);
    expect(can('sub_admin', 'read', 'lessons')).toBe(true);
    expect(can('sub_admin', 'manage', 'lessons')).toBe(false);
    expect(can('sub_admin', 'read', 'admin_users')).toBe(false);
  });

  it('gives other roles read-only access', () => {
    expect(can('Teacher', 'read', 'admin_users')).toBe(true);
    expect(can('Teacher', 'manage', 'roles')).toBe(false);
    expect(can(null, 'read', 'roles')).toBe(true);
  });

  it('always allows the dashboard', () => {
    expect(can('sub_admin', 'read', 'dashboard')).toBe(true);
  });

  it('summarises permissions for the panel', () => {
    expect(permissionsFor('Admin').manageAll).toBe(true);
    expect(permissionsFor('sub_admin').manage).toContain('roles');
  });
});
