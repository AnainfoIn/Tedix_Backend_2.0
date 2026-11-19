import { AuthProvider } from 'react-admin';
import { RESOURCES } from '../../api/src/admin/records/defs';
import { apiFetch, getSession, saveSession, Session } from './api';

/** Actions react-admin asks about, mapped to the API's read/manage permissions. */
const READ_ACTIONS = new Set(['list', 'show', 'export']);

/** Panel resources whose permission key differs (the Rails CanCan names). */
const PERMISSION_KEY: Record<string, string> = {
  grades: 'categories',
  subjects: 'sub_categories',
  masters: 'courses',
  ...Object.fromEntries(RESOURCES.map((r) => [r.key, r.permission])),
};

export function canAccess(session: Session | null, action: string, panelResource: string): boolean {
  if (!session) return false;
  const resource = PERMISSION_KEY[panelResource] ?? panelResource;
  const p = session.admin.permissions;
  if (resource === 'dashboard' || p.manageAll) return true;
  if (p.manage.includes(resource)) return true;
  if (!READ_ACTIONS.has(action)) return false;
  return p.readAll || p.read.includes(resource);
}

/**
 * Sign-in happens on the custom LoginPage (it handles the 2FA step);
 * `login` just stores the session the page got back.
 */
export const authProvider: AuthProvider = {
  login: async (params: { session: Session }) => {
    saveSession(params.session);
  },
  logout: async () => {
    saveSession(null);
  },
  checkAuth: async () => {
    if (!getSession()) throw new Error('Please sign in');
  },
  checkError: async (error: { status?: number }) => {
    if (error?.status === 401) {
      saveSession(null);
      throw new Error('Please sign in again');
    }
  },
  getIdentity: async () => {
    const session = getSession();
    if (!session) throw new Error('Not signed in');
    return { id: session.admin.id, fullName: session.admin.email };
  },
  getPermissions: async () => getSession()?.admin.permissions ?? null,
  canAccess: async ({ action, resource }) => canAccess(getSession(), action, resource),
};

/** Refreshes the stored profile (role and permissions may have changed). */
export async function refreshProfile(): Promise<void> {
  const session = getSession();
  if (!session) return;
  const { data } = await apiFetch<{ data: Session['admin'] }>('/auth/me');
  saveSession({ ...session, admin: data });
}
