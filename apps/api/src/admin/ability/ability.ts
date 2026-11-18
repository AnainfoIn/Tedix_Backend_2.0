/**
 * Port of the Rails CanCan `Ability` (app/models/ability.rb) used by ActiveAdmin.
 *
 * - role "admin"     → manage everything
 * - role "sub_admin" → manage a few resources, read a few more
 * - any other role   → read-only access to everything
 *
 * Resource keys are the admin API resource names (e.g. "roles", "admin_users").
 * Keys for resources that are not migrated yet are listed so the rules stay in one place.
 */
export type AdminAction = 'read' | 'manage';

export const SUB_ADMIN_MANAGE = new Set([
  'accounts',
  'roles',
  'terms_and_conditions',
  'groups',
  'create_bulk_data',
]);

export const SUB_ADMIN_READ = new Set([
  'courses',
  'lessons',
  'assessments',
  'categories',
  'sub_categories',
  'question_banks',
]);

/** Pages every signed-in admin can open. */
export const ALWAYS_ALLOWED = new Set(['dashboard']);

export type AdminRoleKind = 'admin' | 'sub_admin' | 'read_only';

export function roleKind(roleName: string | null | undefined): AdminRoleKind {
  const name = (roleName ?? '').trim().toLowerCase();
  if (name === 'admin') return 'admin';
  if (name === 'sub_admin') return 'sub_admin';
  return 'read_only';
}

export function can(roleName: string | null | undefined, action: AdminAction, resource: string): boolean {
  if (ALWAYS_ALLOWED.has(resource)) return true;
  switch (roleKind(roleName)) {
    case 'admin':
      return true;
    case 'sub_admin':
      if (SUB_ADMIN_MANAGE.has(resource)) return true;
      return action === 'read' && SUB_ADMIN_READ.has(resource);
    default:
      return action === 'read';
  }
}

/** The permission summary the admin panel uses to show or hide menus and buttons. */
export function permissionsFor(roleName: string | null | undefined) {
  const kind = roleKind(roleName);
  return {
    role: kind,
    manageAll: kind === 'admin',
    readAll: kind !== 'sub_admin',
    manage: kind === 'sub_admin' ? [...SUB_ADMIN_MANAGE] : [],
    read: kind === 'sub_admin' ? [...SUB_ADMIN_READ, ...SUB_ADMIN_MANAGE] : [],
  };
}
