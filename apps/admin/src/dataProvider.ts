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

export const dataProvider: DataProvider = {
  getList: async (resource, params) => call(`/${resource}?${listQuery(params)}`),

  getOne: async (resource, params) => call(`/${resource}/${params.id}`),

  getMany: async (resource, params) => {
    const results = await Promise.all(
      params.ids.map((id) => call<{ data: { id: number } }>(`/${resource}/${id}`).catch(() => null)),
    );
    return { data: results.filter((r) => r !== null).map((r) => r!.data) } as never;
  },

  getManyReference: async (resource, params) =>
    call(`/${resource}?${listQuery({ ...params, filter: { ...params.filter, [params.target]: params.id } })}`),

  create: async (resource, params) => call(`/${resource}`, { method: 'POST', body: JSON.stringify(params.data) }),

  update: async (resource, params) =>
    call(`/${resource}/${params.id}`, { method: 'PUT', body: JSON.stringify(params.data) }),

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
};
