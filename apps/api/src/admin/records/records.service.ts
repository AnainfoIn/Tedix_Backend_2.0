import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService, UploadedFile } from '../../storage/storage.service';
import { baseError, FieldErrors, throwIfErrors } from '../../common/validation-error';
import { columnOf, FieldDef, ResourceDef } from './defs/types';
import { HOOKS, HookContext } from './hooks';
import { sanitizeHtml } from './sanitize';
import './rules';

type Row = Record<string, any>;
export type Files = Record<string, UploadedFile[] | undefined>;

export interface RecordListQuery {
  skip: number;
  take: number;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  q?: string;
  filters: Record<string, unknown>;
}

const FILE_TYPES = new Set(['image', 'file']);
/** Join-table values that validate() hands to create/update (not columns of the table). */
const THROUGH = Symbol('through');
const isFile = (f: FieldDef) => FILE_TYPES.has(f.type);
const isStored = (f: FieldDef) => !f.expr && !isFile(f) && !f.through;
const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
const attachmentName = (f: FieldDef) => f.attachment ?? columnOf(f);

/** SQL for a field as seen in SELECT / WHERE / ORDER BY. */
function sqlOf(field: FieldDef): string {
  if (field.through) {
    const j = field.through;
    return `(SELECT COALESCE(array_agg(j.${quote(j.otherColumn)} ORDER BY j.${quote(j.otherColumn)}), '{}') FROM ${quote(j.table)} j WHERE j.${quote(j.ownColumn)} = t.id)`;
  }
  return field.expr ? `(${field.expr})` : `t.${quote(columnOf(field))}`;
}

/**
 * Generic list/show/create/update/delete over a Rails table, driven by a ResourceDef.
 * Runs parameterised SQL; identifiers only ever come from the definitions, never from input.
 */
@Injectable()
export class RecordsService {
  private readonly logger = new Logger('Records');
  /** Columns that exist in the database, per table, loaded once. */
  private columns?: Promise<Map<string, Map<string, string>>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Column name → Postgres type name (udt_name, e.g. int8, varchar, jsonb, _int8). */
  private async tableColumns(table: string): Promise<Map<string, string>> {
    this.columns ??= this.prisma
      .$queryRawUnsafe<{ table_name: string; column_name: string; udt_name: string }[]>(
        `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema = current_schema()`,
      )
      .then((rows) => {
        const map = new Map<string, Map<string, string>>();
        for (const r of rows) (map.get(r.table_name) ?? map.set(r.table_name, new Map()).get(r.table_name)!).set(r.column_name, r.udt_name);
        return map;
      })
      .catch((error) => {
        this.columns = undefined;
        throw error;
      });
    const set = (await this.columns).get(table);
    if (!set) throw new NotFoundException(`This part of the admin is not ready: the database has no ${table} table yet.`);
    return set;
  }

  /** Fields whose column is really in the database (a column missing there is skipped, not fatal). */
  private async liveFields(def: ResourceDef): Promise<FieldDef[]> {
    const cols = await this.tableColumns(def.table);
    return def.fields.filter((f) => f.expr || isFile(f) || f.through || cols.has(columnOf(f)));
  }

  async list(def: ResourceDef, query: RecordListQuery) {
    const fields = await this.liveFields(def);
    const params: unknown[] = [];
    const where = this.whereClause(def, fields, query, params);
    const sortField = query.sortField === 'position' && def.position ? ({ name: 'position', type: 'integer' } as FieldDef) : fields.find((f) => f.name === query.sortField && !isFile(f));
    const order = sortField ? `${sortField.name === 'position' && !fields.includes(sortField) ? 't.position' : sqlOf(sortField)} ${query.sortOrder === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, t.id ${query.sortOrder === 'desc' ? 'DESC' : 'ASC'}` : 't.id ASC';
    const from = `FROM ${quote(def.table)} t ${def.joins ?? ''}`;
    const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count ${from} ${where}`, ...params);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${this.selectList(fields, !!def.position)} ${from} ${where} ORDER BY ${order} LIMIT ${query.take} OFFSET ${query.skip}`,
      ...params,
    );
    return { data: await this.present(def, fields, rows), total: Number(count) };
  }

  async many(def: ResourceDef, ids: bigint[]) {
    if (!ids.length) return { data: [], total: 0 };
    const fields = await this.liveFields(def);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${this.selectList(fields, !!def.position)} FROM ${quote(def.table)} t ${def.joins ?? ''} WHERE t.id = ANY($1::bigint[])${def.scope ? ` AND (${def.scope})` : ''} ORDER BY t.id`,
      ids,
    );
    const data = await this.present(def, fields, rows);
    return { data, total: data.length };
  }

  async get(def: ResourceDef, id: bigint) {
    const fields = await this.liveFields(def);
    const row = await this.findRow(def, fields, id);
    const [record] = await this.present(def, fields, [row], true);
    return record;
  }

  async create(def: ResourceDef, input: Row, files: Files) {
    const fields = await this.liveFields(def);
    if (def.singleton) {
      const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM ${quote(def.table)}`);
      if (count > 0n) baseError(def.singleton);
    }
    const data = await this.validate(def, fields, input, files, null);
    if (def.position) {
      const scope = def.position.scope;
      const params: unknown[] = [];
      const cond = scope ? `WHERE ${quote(scope)} IS NOT DISTINCT FROM $1` : '';
      if (scope) params.push(data[scope] ?? null);
      const [{ max }] = await this.prisma.$queryRawUnsafe<{ max: number | null }[]>(
        `SELECT MAX(position)::int AS max FROM ${quote(def.table)} ${cond}`,
        ...params,
      );
      data.position = (max ?? 0) + 1;
    }
    const cols = await this.tableColumns(def.table);
    const now = new Date();
    if (cols.has('created_at')) data.created_at = now;
    if (cols.has('updated_at')) data.updated_at = now;
    const keys = Object.keys(data);
    const [{ id }] = await this.prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `INSERT INTO ${quote(def.table)} (${keys.map(quote).join(', ')}) VALUES (${keys.map((k, i) => `$${i + 1}::${quote(cols.get(k)!)}`).join(', ')}) RETURNING id`,
      ...keys.map((k) => data[k]),
    );
    await this.saveThrough(fields, id, data);
    await this.saveFiles(def, fields, id, input, files);
    await HOOKS[def.key]?.afterSave?.(this.context(), id, data, null);
    return this.get(def, id);
  }

  async update(def: ResourceDef, id: bigint, input: Row, files: Files) {
    const fields = await this.liveFields(def);
    const current = await this.findRow(def, fields, id);
    if (def.railsClass && fields.some(isFile)) {
      const names = fields.filter(isFile).map(attachmentName);
      const attached = await this.storage.filesFor(def.railsClass, id, names).catch(() => ({}) as Record<string, unknown>);
      current.__files = Object.fromEntries(fields.filter(isFile).map((f) => [f.name, !!(attached as Record<string, unknown>)[attachmentName(f)]]));
    }
    const data = await this.validate(def, fields, input, files, current);
    const cols = await this.tableColumns(def.table);
    if (cols.has('updated_at')) data.updated_at = new Date();
    const keys = Object.keys(data);
    if (keys.length) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE ${quote(def.table)} SET ${keys.map((k, i) => `${quote(k)} = $${i + 2}::${quote(cols.get(k)!)}`).join(', ')} WHERE id = $1`,
        id,
        ...keys.map((k) => data[k]),
      );
    }
    await this.saveThrough(fields, id, data);
    await this.saveFiles(def, fields, id, input, files);
    await HOOKS[def.key]?.afterSave?.(this.context(), id, data, current);
    return this.get(def, id);
  }

  async remove(def: ResourceDef, id: bigint) {
    const fields = await this.liveFields(def);
    const current = await this.findRow(def, fields, id);
    const blocking: string[] = [];
    for (const dep of def.restrictDependents ?? []) {
      if (!(await this.tableColumns(dep.table).catch(() => null))) continue;
      const params: unknown[] = [id];
      let cond = `${quote(dep.column)} = $1`;
      if (dep.typeColumn) {
        params.push(dep.typeValue);
        cond += ` AND ${quote(dep.typeColumn)} = $2`;
      }
      const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM ${quote(dep.table)} WHERE ${cond}`,
        ...params,
      );
      if (count > 0n) blocking.push(dep.label);
    }
    if (blocking.length) baseError(`Cannot delete record because dependent ${blocking.join(', ')} exist`);
    await HOOKS[def.key]?.beforeDelete?.(this.context(), id, current);
    for (const dep of def.destroyDependents ?? []) {
      if (!(await this.tableColumns(dep.table).catch(() => null))) continue;
      const params: unknown[] = [id];
      let cond = `${quote(dep.column)} = $1`;
      if (dep.typeColumn) {
        params.push(dep.typeValue);
        cond += ` AND ${quote(dep.typeColumn)} = $2`;
      }
      await this.prisma.$queryRawUnsafe(`DELETE FROM ${quote(dep.table)} WHERE ${cond}`, ...params);
    }
    await this.prisma.$queryRawUnsafe(`DELETE FROM ${quote(def.table)} WHERE id = $1`, id);
    if (def.railsClass && def.fields.some(isFile)) {
      await this.storage.purgeAll(def.railsClass, id).catch((error: unknown) =>
        this.logger.warn(`Could not remove files of ${def.railsClass} ${id}: ${error instanceof Error ? error.message : error}`),
      );
    }
    return { data: { id: Number(id) } };
  }

  /** acts_as_list: put the record at `target` (1 = first) within its scope. */
  async move(def: ResourceDef, id: bigint, target: number) {
    if (!def.position) throw new NotFoundException();
    if (!Number.isInteger(target) || target < 1) throwIfErrors({ position: ['Position must be a whole number from 1'] });
    const fields = await this.liveFields(def);
    const row = await this.findRow(def, fields, id);
    const scope = def.position.scope;
    const params: unknown[] = [];
    const cond = scope ? `WHERE ${quote(scope)} IS NOT DISTINCT FROM $1` : '';
    if (scope) params.push(row[`__${scope}`] ?? null);
    const siblings = await this.prisma.$queryRawUnsafe<{ id: bigint }[]>(
      `SELECT id FROM ${quote(def.table)} ${cond} ORDER BY position ASC NULLS LAST, id ASC`,
      ...params,
    );
    const ordered = siblings.filter((s) => s.id !== id);
    ordered.splice(Math.min(target, ordered.length + 1) - 1, 0, { id });
    await this.prisma.$transaction(
      ordered.map((s, index) =>
        this.prisma.$executeRawUnsafe(`UPDATE ${quote(def.table)} SET position = $1 WHERE id = $2`, index + 1, s.id),
      ),
    );
    return this.get(def, id);
  }

  // ---------------------------------------------------------------------------------------

  private context(): HookContext {
    return { prisma: this.prisma };
  }

  private selectList(fields: FieldDef[], positioned = false): string {
    const parts = ['t.id AS "id"'];
    for (const f of fields) if (!isFile(f) && f.name !== 'id') parts.push(`${sqlOf(f)} AS ${quote(f.name)}`);
    if (positioned) parts.push('t.position AS "position"');
    return parts.join(', ');
  }

  private async findRow(def: ResourceDef, fields: FieldDef[], id: bigint): Promise<Row> {
    const extra = def.position?.scope ? `, t.${quote(def.position.scope)} AS ${quote(`__${def.position.scope}`)}` : '';
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${this.selectList(fields, !!def.position)}${extra} FROM ${quote(def.table)} t ${def.joins ?? ''} WHERE t.id = $1${def.scope ? ` AND (${def.scope})` : ''}`,
      id,
    );
    if (!rows.length) throw new NotFoundException(`${def.singular} not found`);
    return rows[0];
  }

  private whereClause(def: ResourceDef, fields: FieldDef[], query: RecordListQuery, params: unknown[]): string {
    const conds: string[] = def.scope ? [`(${def.scope})`] : [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (query.q && def.search?.length) {
      const p = add(`%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const cols = def.search
        .map((name) => fields.find((f) => f.name === name))
        .filter((f): f is FieldDef => !!f)
        .map((f) => `${sqlOf(f)}::text ILIKE ${p}`);
      if (cols.length) conds.push(`(${cols.join(' OR ')})`);
    }
    for (const [key, raw] of Object.entries(query.filters)) {
      if (raw === undefined || raw === null || raw === '') continue;
      const [name, op] = key.endsWith('_gte') ? [key.slice(0, -4), 'gte'] : key.endsWith('_lte') ? [key.slice(0, -4), 'lte'] : [key, 'eq'];
      const field = name === 'id' ? ({ name: 'id', type: 'integer' } as FieldDef) : fields.find((f) => f.name === name);
      if (!field || isFile(field)) continue;
      const sql = field.name === 'id' ? 't.id' : sqlOf(field);
      const value = String(raw);
      if (op !== 'eq') {
        if (!['date', 'datetime', 'integer', 'decimal', 'duration'].includes(field.type)) continue;
        const cmp = op === 'gte' ? '>=' : '<=';
        if (field.type === 'datetime' && op === 'lte' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
          conds.push(`${sql} < (${add(value)}::date + 1)`);
        } else if (field.type === 'date' || field.type === 'datetime') {
          if (!/^\d{4}-\d{2}-\d{2}/.test(value)) continue;
          conds.push(`${sql} ${cmp} ${add(value)}::${field.type === 'date' ? 'date' : 'timestamp'}`);
        } else {
          if (!Number.isFinite(Number(value))) continue;
          conds.push(`${sql} ${cmp} ${add(Number(value))}`);
        }
        continue;
      }
      switch (field.type) {
        case 'string':
        case 'text':
        case 'url':
          conds.push(`${sql}::text ILIKE ${add(`%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)}`);
          break;
        case 'boolean':
          conds.push(`${sql} = ${add(value === 'true')}`);
          break;
        case 'reference':
        case 'integer':
          if (!/^\d+$/.test(value)) continue;
          conds.push(`${sql} = ${add(BigInt(value))}`);
          break;
        case 'enum':
          conds.push(`${sql}::text = ${add(value)}`);
          break;
        default:
          conds.push(`${sql}::text = ${add(value)}`);
      }
    }
    return conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  }

  /** Rows → API records: camelCase keys, numbers for ids, labels for references, file URLs. */
  private async present(def: ResourceDef, fields: FieldDef[], rows: Row[], withFiles = true): Promise<Row[]> {
    const out = rows.map((row) => {
      const record: Row = {};
      for (const [k, v] of Object.entries(row)) if (!k.startsWith('__')) record[k] = plain(v);
      for (const f of fields) {
        if (f.type === 'date' && record[f.name]) record[f.name] = String(record[f.name]).slice(0, 10);
        if (f.type === 'duration') record[`${f.name}Text`] = durationText(record[f.name] as number | null);
      }
      return record;
    });
    for (const f of fields.filter((x) => x.type === 'reference' && x.ref)) {
      const ids = [...new Set(out.map((r) => r[f.name]).filter((v) => v !== null && v !== undefined))];
      if (!ids.length) continue;
      const labelSql = f.ref!.labelExpr ?? quote(f.ref!.labelColumn);
      const labels = await this.prisma
        .$queryRawUnsafe<{ id: bigint; label: unknown }[]>(
          `SELECT id, (${labelSql})::text AS label FROM ${quote(f.ref!.table)} WHERE id = ANY($1::bigint[])`,
          ids.map((v) => BigInt(v as number)),
        )
        .catch(() => []);
      const map = new Map(labels.map((l) => [Number(l.id), l.label]));
      for (const r of out) if (r[f.name] != null) r[`${f.name}Label`] = map.get(Number(r[f.name])) ?? null;
    }
    for (const f of fields.filter((x) => x.type === 'references')) {
      for (const r of out) if (Array.isArray(r[f.name])) r[f.name] = r[f.name].map(Number);
    }
    for (const f of fields.filter((x) => x.type === 'references' && x.ref)) {
      const ids = [...new Set(out.flatMap((r) => (Array.isArray(r[f.name]) ? r[f.name] : [])))];
      if (!ids.length) continue;
      const labelSql = f.ref!.labelExpr ?? quote(f.ref!.labelColumn);
      const labels = await this.prisma
        .$queryRawUnsafe<{ id: bigint; label: unknown }[]>(
          `SELECT id, (${labelSql})::text AS label FROM ${quote(f.ref!.table)} WHERE id = ANY($1::bigint[])`,
          ids.map((v) => BigInt(v as number)),
        )
        .catch(() => []);
      const map = new Map(labels.map((l) => [Number(l.id), l.label]));
      for (const r of out) if (Array.isArray(r[f.name])) r[`${f.name}Labels`] = r[f.name].map((v: number) => map.get(Number(v)) ?? `#${v}`);
    }
    const fileFields = fields.filter(isFile);
    if (withFiles && fileFields.length && def.railsClass && out.length) {
      const names = fileFields.map(attachmentName);
      const files = await this.storage
        .filesForMany(def.railsClass, out.map((r) => BigInt(r.id as number)), names)
        .catch(() => new Map<string, Record<string, unknown>>());
      for (const r of out) {
        const forRecord = files.get(String(r.id)) ?? {};
        for (const f of fileFields) r[f.name] = forRecord[attachmentName(f)] ?? null;
      }
    }
    return out;
  }

  private async validate(def: ResourceDef, fields: FieldDef[], input: Row, files: Files, current: Row | null): Promise<Row> {
    const errors: FieldErrors = {};
    const add = (field: string, message: string) => (errors[field] ??= []).push(message);
    const data: Row = {};
    const values: Row = {};
    const through: Record<string, bigint[]> = {};

    for (const f of fields) {
      if (f.expr || isFile(f)) continue;
      const editable = f.form === undefined || f.form === true || (f.form === 'create' && current === null) || (f.form === 'edit' && current !== null);
      const label = f.label ?? humanize(f.name);
      let value: unknown;
      if (editable && (current === null || f.name in input)) {
        const raw = f.name in input ? input[f.name] : f.defaultValue;
        const parsed = parseValue(f, raw);
        if (parsed.error) {
          add(f.name, `${label} ${parsed.error}`);
          continue;
        }
        value = parsed.value;
        if (f.through) through[f.name] = value as bigint[];
        else data[columnOf(f)] = value;
      } else if (current) {
        value = current[f.name];
      } else continue;
      values[f.name] = value;

      if (!editable || !this.applies(f, input, current)) continue;
      const blank = value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length);
      if (f.required && blank) {
        // The Rails models word presence errors by type: references and enums "must exist", dates "must be set".
        const word = ['reference', 'references', 'enum'].includes(f.type) ? 'must exist' : ['date', 'datetime'].includes(f.type) ? 'must be set' : "can't be blank";
        add(f.name, `${label} ${word}`);
        continue;
      }
      if (blank) continue;
      if (typeof value === 'string') {
        if (f.min !== undefined && [...value].length < f.min) add(f.name, `${label} is too short (minimum is ${f.min} characters)`);
        if (f.max !== undefined && [...value].length > f.max) add(f.name, `${label} is too long (maximum is ${f.max} characters)`);
        if (f.pattern && !new RegExp(f.pattern.regex, 'u').test(value)) add(f.name, `${label} ${f.pattern.message}`);
      } else if (typeof value === 'number') {
        if (f.gt !== undefined && !(value > f.gt)) add(f.name, `${label} must be greater than ${f.gt}`);
        if (f.min !== undefined && value < f.min) add(f.name, `${label} must be greater than or equal to ${f.min}`);
        if (f.max !== undefined && value > f.max) add(f.name, `${label} must be less than or equal to ${f.max}`);
      }
      if (f.type === 'enum' && !f.multiple && f.choices && !f.choices.some((c) => String(c.id) === String(value))) add(f.name, `${label} is not included in the list`);
      if (f.type === 'reference' && f.ref) {
        const rows = await this.prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${quote(f.ref.table)} WHERE id = $1`, value);
        if (!rows.length) add(f.name, `${label} must exist`);
      }
      if (f.type === 'references' && f.ref && Array.isArray(value) && value.length) {
        const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
          `SELECT COUNT(*)::bigint AS count FROM ${quote(f.ref.table)} WHERE id = ANY($1::bigint[])`,
          value,
        );
        if (Number(count) !== value.length) add(f.name, `${label} must exist`);
      }
    }

    for (const f of fields) {
      if (!f.unique || errors[f.name] || !(f.name in values)) continue;
      const value = values[f.name];
      if (value === null || value === undefined || value === '') continue;
      if (current && !(f.name in input) && !(f.unique.scope ?? []).some((s) => s in input)) continue;
      const params: unknown[] = [value];
      const ci = !f.unique.caseSensitive && typeof value === 'string';
      const conds = [ci ? `LOWER(${quote(columnOf(f))}) = LOWER($1)` : `${quote(columnOf(f))} = $1`];
      for (const scopeName of f.unique.scope ?? []) {
        const sf = fields.find((x) => x.name === scopeName);
        if (!sf) continue;
        params.push(values[scopeName] ?? null);
        conds.push(`${quote(columnOf(sf))} IS NOT DISTINCT FROM $${params.length}`);
      }
      if (current) {
        params.push(BigInt(current.id as number));
        conds.push(`id <> $${params.length}`);
      }
      const rows = await this.prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM ${quote(def.table)} WHERE ${conds.join(' AND ')} LIMIT 1`, ...params);
      if (rows.length) add(f.name, f.unique.message ?? `${f.label ?? humanize(f.name)} has already been taken`);
    }

    for (const f of fields.filter(isFile)) {
      const file = files[f.name]?.[0];
      const label = f.label ?? humanize(f.name);
      if (!file) {
        const removing = truthy(input[`remove${f.name[0].toUpperCase()}${f.name.slice(1)}`]);
        if (f.required && this.applies(f, input, current) && (current === null || removing || !current.__files?.[f.name])) add(f.name, `${label} must be attached`);
        continue;
      }
      if (f.accept && !f.accept.includes(file.mimetype)) add(f.name, `${label} ${f.acceptMessage ?? `must be a ${f.accept.map((t) => t.split('/')[1].toUpperCase()).join(', ')} file`}`);
      else if (f.maxMb && file.size > f.maxMb * 1024 * 1024) add(f.name, `${label} size must be less than ${f.maxMb}MB`);
    }

    await HOOKS[def.key]?.validate?.(this.context(), { data, values, input, files, current, add });
    throwIfErrors(errors);
    await HOOKS[def.key]?.beforeSave?.(this.context(), { data, values, current });
    Object.defineProperty(data, THROUGH, { value: through, enumerable: false });
    return data;
  }

  /** A `when` field only counts while its condition field has one of the listed values. */
  private applies(f: FieldDef, input: Row, current: Row | null): boolean {
    if (!f.when) return true;
    const value = f.when.field in input ? input[f.when.field] : current?.[f.when.field];
    return f.when.in.some((v) => String(v) === String(value));
  }

  /** Replaces the join-table rows of `references` fields that were sent. */
  private async saveThrough(fields: FieldDef[], id: bigint, data: Row) {
    const values: Record<string, bigint[]> = (data as any)[THROUGH] ?? {};
    for (const f of fields.filter((x) => x.through && x.name in values)) {
      const j = f.through!;
      const cols = await this.tableColumns(j.table);
      await this.prisma.$queryRawUnsafe(`DELETE FROM ${quote(j.table)} WHERE ${quote(j.ownColumn)} = $1`, id);
      const stamps = ['created_at', 'updated_at'].filter((c) => cols.has(c));
      for (const other of values[f.name] ?? []) {
        await this.prisma.$queryRawUnsafe(
          `INSERT INTO ${quote(j.table)} (${[j.ownColumn, j.otherColumn, ...stamps].map(quote).join(', ')}) VALUES ($1, $2${stamps.map(() => ', now()').join('')})`,
          id,
          other,
        );
      }
    }
  }

  private async saveFiles(def: ResourceDef, fields: FieldDef[], id: bigint, input: Row, files: Files) {
    if (!def.railsClass) return;
    for (const f of fields.filter(isFile)) {
      const file = files[f.name]?.[0];
      const removeKey = `remove${f.name[0].toUpperCase()}${f.name.slice(1)}`;
      if (file) await this.storage.attach(def.railsClass, id, attachmentName(f), file);
      else if (truthy(input[removeKey])) await this.storage.purge(def.railsClass, id, attachmentName(f));
    }
  }
}

function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === 'bigint') return Number(value);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber: unknown }).toNumber === 'function') {
    return (value as { toNumber(): number }).toNumber();
  }
  return value;
}

export function humanize(name: string): string {
  const words = name.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function truthy(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 1 || value === 'on';
}

const DURATION_UNITS: Record<string, number> = { min: 60, mins: 60, minute: 60, minutes: 60, hour: 3600, hours: 3600, day: 86400, days: 86400 };

/** Booster-style duration: "2 days, 3 hours, 30 mins" ↔ seconds. */
export function parseDuration(text: string): number | null {
  if (!/^(\d+\s+(mins|hours|days)\s*,?\s*)+$/i.test(text.trim())) return null;
  let total = 0;
  for (const [, amount, unit] of text.matchAll(/(\d+)\s+(\w+)/g)) {
    const seconds = DURATION_UNITS[unit.toLowerCase()];
    if (!seconds) return null;
    total += Number(amount) * seconds;
  }
  return total;
}

export function durationText(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined) return null;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days} days`);
  if (hours) parts.push(`${hours} hours`);
  if (minutes) parts.push(`${minutes} mins`);
  return parts.join(', ') || '0 mins';
}

function parseValue(f: FieldDef, raw: unknown): { value?: unknown; error?: string } {
  if (raw === undefined || raw === null) return { value: null };
  if (typeof raw === 'string' && raw.trim() === '' && f.type !== 'string' && f.type !== 'text') return { value: null };
  switch (f.type) {
    case 'string':
    case 'text':
    case 'url': {
      let s = String(raw);
      if (f.sanitize) s = sanitizeHtml(s);
      if (f.normalize === 'squish') s = s.trim().replace(/\s+/g, ' ');
      else if (f.normalize === 'upcase') s = s.trim().toUpperCase();
      else if (f.normalize === 'downcase') s = s.trim().toLowerCase();
      else if (f.normalize === 'strip') s = s.trim();
      return { value: s === '' && f.normalize ? null : s };
    }
    case 'integer':
    case 'reference': {
      const s = String(raw).trim();
      if (!/^-?\d+$/.test(s)) return { error: 'is not a number' };
      return { value: f.type === 'reference' ? BigInt(s) : Number(s) };
    }
    case 'references': {
      const list = Array.isArray(raw) ? raw : String(raw).split(',');
      const ids = list.map((v) => String(v).trim()).filter(Boolean);
      if (ids.some((v) => !/^\d+$/.test(v))) return { error: 'must be a list of ids' };
      return { value: [...new Set(ids)].map((v) => BigInt(v)) };
    }
    case 'enum': {
      if (f.multiple) {
        const list = (Array.isArray(raw) ? raw : String(raw).split(',')).map((v) => String(v).trim()).filter(Boolean);
        const bad = list.find((v) => !f.choices?.some((c) => String(c.id) === v));
        return bad ? { error: 'is not included in the list' } : { value: [...new Set(list)] };
      }
      const choice = f.choices?.find((c) => String(c.id) === String(raw));
      return { value: choice ? choice.id : String(raw) };
    }
    case 'decimal': {
      const n = Number(raw);
      return Number.isFinite(n) ? { value: n } : { error: 'is not a number' };
    }
    case 'boolean':
      return { value: truthy(raw) };
    case 'date': {
      const s = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { value: new Date(`${s}T00:00:00Z`) } : { error: 'is not a valid date' };
    }
    case 'datetime': {
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? { error: 'is not a valid date' } : { value: d };
    }
    case 'duration': {
      if (typeof raw === 'number') return { value: raw };
      const seconds = parseDuration(String(raw));
      return seconds === null ? { error: 'must be like "2 days, 3 hours, 30 mins" (days, hours, mins only)' } : { value: seconds };
    }
    case 'json':
      if (typeof raw === 'string') {
        try {
          return { value: JSON.stringify(JSON.parse(raw)) };
        } catch {
          return { error: 'is not valid JSON' };
        }
      }
      return { value: JSON.stringify(raw) };
    default:
      return { value: f.sanitize && typeof raw === 'string' ? sanitizeHtml(raw) : raw };
  }
}
