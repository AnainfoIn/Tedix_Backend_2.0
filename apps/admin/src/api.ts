/** Base URL of the admin API. Same origin by default (the API serves this panel). */
export const API_URL = (import.meta.env.VITE_API_URL ?? '') + '/admin/api';

const SESSION_KEY = 'tedix_admin_session';

export interface AdminProfile {
  id: number;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
  permissions: {
    role: 'admin' | 'sub_admin' | 'read_only';
    manageAll: boolean;
    readAll: boolean;
    manage: string[];
    read: string[];
  };
}

export interface Session {
  token: string;
  expiresAt: string;
  admin: AdminProfile;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage blocked: the admin will need to sign in again on reload.
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (session) headers.set('Authorization', `Bearer ${session.token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = (body && (Array.isArray(body.message) ? body.message.join(', ') : body.message)) || response.statusText;
    throw new ApiError(message, response.status, body);
  }
  return body as T;
}
