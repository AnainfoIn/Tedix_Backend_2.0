import { DataProvider, HttpError } from 'react-admin';
import { ApiError, apiFetch } from './api';

/**
 * Talks to the NestJS admin API:
 *   GET    /admin/api/:resource?page=&perPage=&sort=&order=&q=&<filters>  → { data, total }
 *   GET    /admin/api/:resource/:id                                      → { data }
 *   POST   /admin/api/:resource          PUT/DELETE /admin/api/:resource/:id
 * Validation errors (422) come back as { errors: { field: [messages] } } and show on the form.
 */
async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { errors?: Record<string, string[]> } | null;
      const errors = body?.errors
        ? Object.fromEntries(Object.entries(body.errors).map(([field, list]) => [field, list.join(', ')]))
        : undefined;
      const root = errors?.base ? { serverError: errors.base } : undefined;
      throw new HttpError(error.message, error.status, errors ? { errors: { ...errors, ...(root ? { root } : {}) } } : error.body);
    }
    throw error;
  }
}

function listQuery(params: {
  pagination?: { page: number; perPage: number };
  sort?: { field: string; order: string };
  filter?: Record<string, unknown>;
}): string {
  const query = new URLSearchParams();
  if (params.pagination) {
    query.set('page', String(params.pagination.page));
    query.set('perPage', String(params.pagination.perPage));
  }
  if (params.sort?.field) {
    query.set('sort', params.sort.field);
    query.set('order', params.sort.order);
  }
  for (const [key, value] of Object.entries(params.filter ?? {})) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  return query.toString();
}

/** File fields of the Contents levels (Active Storage attachments). */
export const FILE_KEYS = ['image', 'cheatsheetPdf', 'summaryPdf', 'summaryVideo'] as const;

type FileValue = { url?: string | null; filename?: string; rawFile?: File; src?: string; title?: string };
type AnyRecord = Record<string, unknown>;

/** Gives stored files the `src`/`title` that react-admin's FileInput and ImageInput preview. */
function withFilePreviews<T>(record: T): T {
  if (!record || typeof record !== 'object') return record;
  const out = { ...(record as AnyRecord) };
  for (const key of FILE_KEYS) {
    const file = out[key] as FileValue | null | undefined;
    if (file && !file.rawFile) out[key] = { ...file, src: file.url ?? undefined, title: file.filename };
  }
  return out as T;
}

/** Sends JSON, or multipart when a file was picked. A cleared file is sent as removeX=true. */
function body(data: AnyRecord, previous?: AnyRecord): string | FormData {
  const payload: AnyRecord = { ...data };
  let hasFile = false;
  for (const key of FILE_KEYS) {
    if (!(key in payload)) continue;
    const value = payload[key] as FileValue | null;
    delete payload[key];
    if (value?.rawFile) {
      payload[key] = value.rawFile;
      hasFile = true;
    } else if (value == null && previous?.[key]) {
      payload[`remove${key[0].toUpperCase()}${key.slice(1)}`] = true;
    }
  }
  if (!hasFile) return JSON.stringify(payload);
  const form = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (value instanceof File) form.append(key, value, value.name);
    else if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)));
    else if (typeof value === 'object') continue;
    else form.append(key, String(value));
  }
  return form;
}

export const dataProvider: DataProvider = {
  getList: async (resource, params) => call(`/${resource}?${listQuery(params)}`),

  getOne: async (resource, params) => {
    const result = await call<{ data: AnyRecord }>(`/${resource}/${params.id}`);
    return { data: withFilePreviews(result.data) } as never;
  },

  getMany: async (resource, params) => {
    const results = await Promise.all(
      params.ids.map((id) => call<{ data: { id: number } }>(`/${resource}/${id}`).catch(() => null)),
    );
    return { data: results.filter((r) => r !== null).map((r) => r!.data) } as never;
  },

  getManyReference: async (resource, params) =>
    call(`/${resource}?${listQuery({ ...params, filter: { ...params.filter, [params.target]: params.id } })}`),

  create: async (resource, params) => {
    const result = await call<{ data: AnyRecord }>(`/${resource}`, { method: 'POST', body: body(params.data) });
    return { data: withFilePreviews(result.data) } as never;
  },

  update: async (resource, params) => {
    const result = await call<{ data: AnyRecord }>(`/${resource}/${params.id}`, {
      method: 'PUT',
      body: body(params.data, params.previousData),
    });
    return { data: withFilePreviews(result.data) } as never;
  },

  updateMany: async (resource, params) => {
    await Promise.all(
      params.ids.map((id) => call(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(params.data) })),
    );
    return { data: params.ids };
  },

  delete: async (resource, params) => call(`/${resource}/${params.id}`, { method: 'DELETE' }),

  deleteMany: async (resource, params) => {
    for (const id of params.ids) {
      await call(`/${resource}/${id}`, { method: 'DELETE' });
    }
    return { data: params.ids };
  },

  /** Contents ordering: moves an item to `position` (1 = first) among its siblings. */
  move: async (resource: string, params: { id: number; position: number }) =>
    call(`/${resource}/${params.id}/position`, { method: 'PUT', body: JSON.stringify({ position: params.position }) }),

  /** Contents tree browser: children of the node named by the ids in `filter`. */
  tree: async (filter: Record<string, string>) =>
    call<{ level: string | null; data: TreeNode[] }>(`/contents/tree?${new URLSearchParams(filter)}`),
};

export interface TreeNode {
  id: number;
  name: string;
  position: number | null;
  hasChildren: boolean;
  filter: Record<string, string> | null;
}
