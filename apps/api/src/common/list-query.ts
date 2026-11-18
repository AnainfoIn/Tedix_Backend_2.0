import { BadRequestException } from '@nestjs/common';

export interface ListQuery {
  skip: number;
  take: number;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  q?: string;
}

/**
 * Parses the list parameters the admin panel sends:
 * `?page=1&perPage=25&sort=id&order=ASC&q=search`.
 */
export function parseListQuery(
  query: Record<string, unknown>,
  allowedSortFields: string[],
  defaultSort = 'id',
): ListQuery {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const perPage = Math.min(200, Math.max(1, Number(query.perPage ?? 25) || 25));
  const sortField = String(query.sort ?? defaultSort);
  if (!allowedSortFields.includes(sortField)) {
    throw new BadRequestException(`Cannot sort by "${sortField}"`);
  }
  const sortOrder = String(query.order ?? 'ASC').toLowerCase() === 'desc' ? 'desc' : 'asc';
  const q = typeof query.q === 'string' && query.q.trim() ? query.q.trim() : undefined;
  return { skip: (page - 1) * perPage, take: perPage, sortField, sortOrder, q };
}

export function parseId(raw: string): bigint {
  if (!/^\d+$/.test(raw)) {
    throw new BadRequestException('Invalid id');
  }
  return BigInt(raw);
}
