import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ListQuery } from '../../common/list-query';
import { baseError, FieldErrors, throwIfErrors } from '../../common/validation-error';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService, UploadedFile } from '../../storage/storage.service';
import {
  ALL_FILE_FIELDS, FILE_FIELDS, FILE_RULES, FileField, IdField, LEVEL_OF_FIELD, LevelConfig, LevelKey, LEVELS, SCOPE_WORD,
} from './levels';

type Row = Record<string, any> & { id: bigint; name: string };
export type UploadedFiles = Partial<Record<FileField, UploadedFile[]>>;
export type ListFilters = Partial<Record<IdField, bigint>>;

const ID_FIELDS: IdField[] = ['countryId', 'gradeId', 'subjectId', 'masterId', 'mainId', 'unitId'];
const DEFAULT_ICON_DIR = join(__dirname, '..', '..', '..', 'assets', 'default-icons');

const text = (value: unknown) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');
const truthy = (value: unknown) => value === true || value === 'true' || value === '1' || value === 1;

export function parseIdValue(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return BigInt(value.trim());
  return null;
}

export function parseIdList(value: unknown): bigint[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : value == null ? [] : [value];
  return [...new Set(raw.map(parseIdValue).filter((id): id is bigint => id !== null).map(String))].map(BigInt);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Admin CRUD for every level of the Contents tree, with the rules of the Rails models:
 * names unique (ignoring case) within the parent, ancestor ids copied from the parent,
 * acts_as_list ordering, Active Storage files, and delete blocked while anything depends on it.
 */
@Injectable()
export class ContentsService {
  private readonly logger = new Logger('Contents');

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

  private delegate(level: LevelConfig): any {
    return (this.prisma as any)[level.model];
  }

  // ---------------------------------------------------------------- reading

  async list(key: LevelKey, query: ListQuery, filters: ListFilters) {
    const level = LEVELS[key];
    const where = await this.whereFor(level, query.q, filters);
    if (where === null) return { data: [], total: 0 };
    const orderBy = query.sortField === 'id' ? { id: query.sortOrder } : [{ [query.sortField]: query.sortOrder }, { id: 'asc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.delegate(level).findMany({ where, skip: query.skip, take: query.take, orderBy }),
      this.delegate(level).count({ where }),
    ]);
    return { data: await this.present(level, rows, false), total };
  }

  /** Several records by id, for the admin panel's reference fields. */
  async many(key: LevelKey, ids: bigint[]) {
    const level = LEVELS[key];
    const rows = await this.delegate(level).findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
    return { data: await this.present(level, rows, false) };
  }

  async get(key: LevelKey, id: bigint) {
    const level = LEVELS[key];
    const row = await this.find(level, id);
    const [record] = await this.present(level, [row], true);
    return { ...record, children: level.child ? await this.children(level, row) : undefined };
  }

  /** Children of a node for the tree browser. No ids = the countries. */
  async tree(filters: ListFilters) {
    const deepest = [...ID_FIELDS].reverse().find((field) => filters[field] !== undefined);
    const parentLevel = deepest ? LEVELS[LEVEL_OF_FIELD[deepest]] : undefined;
    const childKey: LevelKey | undefined = parentLevel ? parentLevel.child : 'countries';
    if (!childKey) return { level: null, data: [] };
    const child = LEVELS[childKey];
    const where = await this.whereFor(child, undefined, filters);
    const rows: Row[] = where === null ? [] : await this.delegate(child).findMany({ where, orderBy: this.childOrder(child) });
    return {
      level: childKey,
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        position: row.position ?? null,
        hasChildren: Boolean(child.child),
        filter: child.ownIdField ? { ...this.stringIds(filters), [child.ownIdField]: String(row.id) } : null,
      })),
    };
  }

  private stringIds(filters: ListFilters) {
    return Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)]));
  }

  private childOrder(level: LevelConfig) {
    return level.positionScope ? [{ position: 'asc' }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }];
  }

  private async children(level: LevelConfig, row: Row) {
    const child = LEVELS[level.child!];
    const filters: ListFilters = {};
    for (const field of level.ancestors) filters[field] = row[field];
    filters[level.ownIdField!] = row.id;
    const where = await this.whereFor(child, undefined, filters);
    const rows: Row[] = where === null ? [] : await this.delegate(child).findMany({ where, orderBy: this.childOrder(child) });
    return { level: child.key, data: rows.map((r) => ({ id: r.id, name: r.name, position: r.position ?? null })) };
  }

  private async whereFor(level: LevelConfig, q: string | undefined, filters: ListFilters): Promise<Record<string, unknown> | null> {
    const where: Record<string, unknown> = {};
    if (q) where.name = { contains: q, mode: 'insensitive' };
    for (const field of ID_FIELDS) {
      const value = filters[field];
      if (value === undefined) continue;
      if (level.ancestors.includes(field)) {
        where[field] = value;
      } else if (level.key === 'subjects' && field === 'gradeId') {
        const links = await this.prisma.gradeSubject.findMany({ where: { gradeId: value }, select: { subjectId: true } });
        if (!links.length) return null;
        where.id = { in: links.map((l) => l.subjectId) };
      }
    }
    return where;
  }

  private async find(level: LevelConfig, id: bigint): Promise<Row> {
    const row = await this.delegate(level).findUnique({ where: { id } });
    if (!row) throw new NotFoundException(`${level.singular} not found`);
    return row;
  }

  /** Adds ancestor names, the path, grades of subjects and (on the detail page) the files. */
  private async present(level: LevelConfig, rows: Row[], withFiles: boolean) {
    const names = await this.ancestorNames(rows, level.ancestors);
    let gradesBySubject = new Map<string, bigint[]>();
    if (level.key === 'subjects' && rows.length) {
      const links = await this.prisma.gradeSubject.findMany({ where: { subjectId: { in: rows.map((r) => r.id) } }, orderBy: { id: 'asc' } });
      for (const link of links) {
        const list = gradesBySubject.get(String(link.subjectId)) ?? [];
        list.push(link.gradeId);
        gradesBySubject.set(String(link.subjectId), list);
      }
      const gradeNames = await this.namesOf('grades', links.map((l) => l.gradeId));
      names.set('gradeId', new Map([...(names.get('gradeId') ?? []), ...gradeNames]));
    }
    const files = withFiles && level.files.length
      ? await this.storage.filesForMany(level.recordType, rows.map((r) => r.id), level.files.map((f) => FILE_FIELDS[f].attachment))
      : undefined;
    return rows.map((row) => {
      const out: Record<string, unknown> = { ...row };
      if (row.startDate instanceof Date) out.startDate = row.startDate.toISOString().slice(0, 10);
      if (row.endDate instanceof Date) out.endDate = row.endDate.toISOString().slice(0, 10);
      const path: string[] = [];
      for (const field of level.ancestors) {
        const name = names.get(field)?.get(String(row[field])) ?? null;
        out[field.replace(/Id$/, 'Name')] = name;
        path.push(name ?? '?');
      }
      if (level.key === 'subjects') {
        const gradeIds = gradesBySubject.get(String(row.id)) ?? [];
        out.gradeIds = gradeIds;
        out.gradeNames = gradeIds.map((g) => names.get('gradeId')?.get(String(g)) ?? '?');
      }
      out.path = path.join(' / ');
      if (files) {
        const attached = files.get(String(row.id))!;
        for (const field of level.files) out[field] = attached[FILE_FIELDS[field].attachment];
        out.storageConfigured = this.storage.configured;
      }
      return out;
    });
  }

  private async ancestorNames(rows: Row[], fields: IdField[]) {
    const names = new Map<IdField, Map<string, string>>();
    for (const field of fields) {
      names.set(field, await this.namesOf(LEVEL_OF_FIELD[field], rows.map((r) => r[field])));
    }
    return names;
  }

  private async namesOf(key: LevelKey, ids: bigint[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id) => id != null).map(String))].map(BigInt);
    if (!unique.length) return new Map();
    const rows: Row[] = await this.delegate(LEVELS[key]).findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [String(r.id), r.name]));
  }

  // ---------------------------------------------------------------- writing

  async create(key: LevelKey, input: Record<string, unknown>, files: UploadedFiles) {
    const level = LEVELS[key];
    const { data, gradeIds } = await this.validate(level, input, files, null);
    if (level.positionScope) data.position = (await this.maxPosition(level, data[level.positionScope])) + 1;
    if (level.key === 'lessons') {
      const max = await this.prisma.lesson.aggregate({ where: { unitId: data.unitId }, _max: { lessonNumber: true } });
      data.lessonNumber = (max._max.lessonNumber ?? 0) + 1;
    }
    const row: Row = await this.delegate(level).create({ data });
    if (gradeIds) await this.setGrades(row.id, gradeIds);
    await this.saveFiles(level, row.id, input, files, true);
    return this.get(key, row.id);
  }

  async update(key: LevelKey, id: bigint, input: Record<string, unknown>, files: UploadedFiles) {
    const level = LEVELS[key];
    const current = await this.find(level, id);
    const { data, gradeIds } = await this.validate(level, input, files, current);
    if (level.positionScope && String(data[level.positionScope]) !== String(current[level.positionScope])) {
      // Moved to another parent: acts_as_list closes the gap and adds it at the bottom of the new list.
      await this.closeGap(level, current);
      data.position = (await this.maxPosition(level, data[level.positionScope])) + 1;
    }
    await this.delegate(level).update({ where: { id }, data });
    if (gradeIds) await this.setGrades(id, gradeIds);
    await this.saveFiles(level, id, input, files, false);
    if (level.key !== 'countries' && level.key !== 'lessons') await this.cascadeAncestors(level, id);
    return this.get(key, id);
  }

  async remove(key: LevelKey, id: bigint) {
    const level = LEVELS[key];
    const row = await this.find(level, id);
    const blocking = await this.blockingDependents(level, id);
    if (blocking.length) {
      baseError(`Cannot delete this ${level.singular.toLowerCase()} because it still has ${blocking.join(', ')}.`);
    }
    if (level.key === 'grades') await this.removeGradeFromSubjects(id);
    if (level.key === 'subjects') await this.prisma.gradeSubject.deleteMany({ where: { subjectId: id } });
    await this.delegate(level).delete({ where: { id } });
    if (level.positionScope) await this.closeGap(level, row);
    if (level.files.length) await this.storage.purgeAll(level.recordType, id);
    return { id: row.id, name: row.name };
  }

  /** acts_as_list insert_at: moves the item to `position` (1 = first) and renumbers its siblings. */
  async move(key: LevelKey, id: bigint, position: unknown) {
    const level = LEVELS[key];
    if (!level.positionScope) baseError(`${level.plural} have no order.`);
    const row = await this.find(level, id);
    const target = Number(position);
    if (!Number.isInteger(target) || target < 1) throwIfErrors({ position: ['Position must be a whole number from 1'] });
    const siblings: Row[] = await this.delegate(level).findMany({
      where: { [level.positionScope!]: row[level.positionScope!] },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    const ordered = siblings.filter((s) => s.id !== row.id);
    ordered.splice(Math.min(target, ordered.length + 1) - 1, 0, row);
    await this.prisma.$transaction(
      ordered.map((s, index) => this.delegate(level).update({ where: { id: s.id }, data: { position: index + 1 } })),
    );
    return this.get(key, id);
  }

  private async validate(level: LevelConfig, input: Record<string, unknown>, files: UploadedFiles, current: Row | null) {
    const errors: FieldErrors = {};
    const add = (field: string, message: string) => (errors[field] ??= []).push(message);
    const data: Record<string, any> = {};
    const has = (field: string) => current === null || field in input;

    const name = has('name') ? text(input.name) : current!.name;
    if (!name) add('name', "Name can't be blank");
    else {
      if (name.length < level.nameMin) add('name', `Name is too short (minimum is ${level.nameMin} characters)`);
      if (name.length > 100) add('name', 'Name is too long (maximum is 100 characters)');
    }
    data.name = name;

    if (level.key === 'countries') {
      const alpha2 = has('alpha2') ? text(input.alpha2).toUpperCase() : current!.alpha2;
      const alpha3 = has('alpha3') ? text(input.alpha3).toUpperCase() : current!.alpha3;
      const code = has('countryCode') ? text(input.countryCode) : current!.countryCode;
      if (!alpha2) add('alpha2', "Alpha2 can't be blank");
      else if (!/^[A-Z]{2}$/.test(alpha2)) add('alpha2', 'Alpha2 must contain exactly 2 uppercase letters');
      if (!alpha3) add('alpha3', "Alpha3 can't be blank");
      else if (!/^[A-Z]{3}$/.test(alpha3)) add('alpha3', 'Alpha3 must contain exactly 3 uppercase letters');
      if (!code) add('countryCode', "Code can't be blank");
      else if (!/^\d{1,4}$/.test(code)) add('countryCode', 'Code must contain only numbers and be between 1 to 4 digits');
      Object.assign(data, { alpha2, alpha3, countryCode: code });
      for (const [field, value, label] of [['name', name, 'Name'], ['alpha2', alpha2, 'Alpha2'], ['alpha3', alpha3, 'Alpha3']] as const) {
        if (value && !errors[field] && (await this.taken(level, field, value, {}, current?.id))) add(field, `${label} has already been taken`);
      }
    }

    // Parents: what the admin picks, then the ancestors copied from it.
    let gradeIds: bigint[] | undefined;
    const pick = (field: IdField) => (has(field) ? parseIdValue(input[field]) : (current![field] as bigint));
    if (level.key === 'grades' || level.key === 'subjects' || level.key === 'masters') {
      const countryId = pick('countryId');
      if (!countryId || !(await this.exists('countries', countryId))) add('countryId', 'Country must exist');
      else data.countryId = countryId;
    }
    if (level.key === 'subjects' && (current === null || 'gradeIds' in input)) {
      gradeIds = parseIdList(input.gradeIds);
      const valid = data.countryId && gradeIds.length
        ? await this.prisma.grade.count({ where: { id: { in: gradeIds }, countryId: data.countryId } })
        : 0;
      if (!gradeIds.length) add('gradeIds', 'Grades must exist');
      else if (data.countryId && valid !== gradeIds.length) add('gradeIds', 'Grades must belong to the selected country');
    }
    if (level.key === 'masters') {
      const gradeId = pick('gradeId');
      const subjectId = pick('subjectId');
      const grade = gradeId ? await this.prisma.grade.findUnique({ where: { id: gradeId } }) : null;
      const subject = subjectId ? await this.prisma.subject.findUnique({ where: { id: subjectId } }) : null;
      if (!grade) add('gradeId', 'Grade must exist');
      else if (data.countryId && grade.countryId !== data.countryId) add('gradeId', 'Grade must belong to the selected country');
      if (!subject) add('subjectId', 'Subject must exist');
      else if (data.countryId && subject.countryId !== data.countryId) add('subjectId', 'Subject must belong to the selected country');
      else if (grade && !(await this.prisma.gradeSubject.count({ where: { gradeId: grade.id, subjectId: subject.id } }))) {
        add('subjectId', 'Subject is not taught in the selected grade');
      }
      if (grade) data.gradeId = grade.id;
      if (subject) data.subjectId = subject.id;
    }
    if (level.parent && ['mains', 'units', 'lessons'].includes(level.key)) {
      const parentLevel = LEVELS[level.parent.level];
      const parentId = pick(level.parent.field);
      const parent: Row | null = parentId ? await this.delegate(parentLevel).findUnique({ where: { id: parentId } }) : null;
      if (!parent) add(level.parent.field, `${parentLevel.singular} must exist`);
      else {
        for (const field of parentLevel.ancestors) data[field] = parent[field];
        data[level.parent.field] = parent.id;
      }
    }

    if (level.uniqueWithin && name && !errors.name && data[level.uniqueWithin] !== undefined) {
      const scope = { [level.uniqueWithin]: data[level.uniqueWithin] };
      if (await this.taken(level, 'name', name, scope, current?.id)) {
        add('name', `Name has already been taken for this ${SCOPE_WORD[level.uniqueWithin]}`);
      }
    }

    if (level.key === 'lessons') {
      const start = has('startDate') ? parseDate(input.startDate) : current!.startDate;
      const end = has('endDate') ? parseDate(input.endDate) : current!.endDate;
      if (!start) add('startDate', 'Start date must be set');
      if (!end) add('endDate', 'End date must be set');
      if (start && end && end < start) add('endDate', 'End date must be after start date');
      data.startDate = start;
      data.endDate = end;
      if (has('isUpgraded')) data.isUpgraded = truthy(input.isUpgraded);
    }

    for (const field of ALL_FILE_FIELDS) {
      const file = files[field]?.[0];
      if (!file) continue;
      if (!level.files.includes(field)) continue;
      const rule = FILE_RULES[FILE_FIELDS[field].kind];
      const label = FILE_FIELDS[field].label;
      if (!(rule.types as readonly string[]).includes(file.mimetype)) add(field, `${label} ${rule.typeError}`);
      else if (file.size > rule.maxBytes) add(field, `${label} size must be less than ${rule.maxBytes / 1024 / 1024}MB`);
    }

    throwIfErrors(errors);
    return { data, gradeIds };
  }

  private async taken(level: LevelConfig, field: string, value: string, scope: Record<string, unknown>, exceptId?: bigint) {
    const count = await this.delegate(level).count({
      where: { ...scope, [field]: { equals: value, mode: 'insensitive' }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    return count > 0;
  }

  private async exists(key: LevelKey, id: bigint) {
    return (await this.delegate(LEVELS[key]).count({ where: { id } })) > 0;
  }

  private async maxPosition(level: LevelConfig, scopeValue: unknown): Promise<number> {
    const result = await this.delegate(level).aggregate({ where: { [level.positionScope!]: scopeValue }, _max: { position: true } });
    return result._max.position ?? 0;
  }

  private async closeGap(level: LevelConfig, row: Row) {
    if (row.position == null) return;
    await this.delegate(level).updateMany({
      where: { [level.positionScope!]: row[level.positionScope!], position: { gt: row.position }, NOT: { id: row.id } },
      data: { position: { decrement: 1 } },
    });
  }

  private async setGrades(subjectId: bigint, gradeIds: bigint[]) {
    await this.prisma.$transaction([
      this.prisma.gradeSubject.deleteMany({ where: { subjectId } }),
      this.prisma.gradeSubject.createMany({ data: gradeIds.map((gradeId) => ({ gradeId, subjectId })) }),
    ]);
  }

  /**
   * Keeps the copied ancestor ids of everything below in step when a parent moves. Rails does
   * not do this (it only has the forms), but stale ids would hide content in filtered lists.
   */
  private async cascadeAncestors(level: LevelConfig, id: bigint) {
    const row = await this.find(level, id);
    let key = level.child;
    while (key) {
      const below = LEVELS[key];
      const data: Record<string, unknown> = {};
      for (const field of level.ancestors) data[field] = row[field];
      if (below.ancestors.includes(level.ownIdField!)) {
        await this.delegate(below).updateMany({ where: { [level.ownIdField!]: id }, data });
      }
      key = below.child;
    }
  }

  private async saveFiles(level: LevelConfig, id: bigint, input: Record<string, unknown>, files: UploadedFiles, isNew: boolean) {
    for (const field of level.files) {
      const file = files[field]?.[0];
      const attachment = FILE_FIELDS[field].attachment;
      if (file) await this.storage.attach(level.recordType, id, attachment, file);
      else if (field !== 'image' && truthy(input[`remove${field[0].toUpperCase()}${field.slice(1)}`])) {
        await this.storage.purge(level.recordType, id, attachment);
      }
    }
    // Rails attaches a default icon when none is given (set_default_image).
    if (isNew && level.defaultIcon && !files.image?.[0] && this.storage.configured) {
      try {
        const buffer = await readFile(join(DEFAULT_ICON_DIR, level.defaultIcon));
        await this.storage.attach(level.recordType, id, 'image', {
          buffer, originalname: level.defaultIcon, mimetype: 'image/jpeg', size: buffer.length,
        });
      } catch (error) {
        this.logger.warn(`Could not attach the default icon: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  private async blockingDependents(level: LevelConfig, id: bigint): Promise<string[]> {
    const found: string[] = [];
    for (const dependent of level.dependents) {
      const rows = await this.prisma.$queryRawUnsafe<{ present: boolean }[]>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2
         ) AS present`,
        dependent.table,
        dependent.column,
      );
      if (!rows[0]?.present) continue;
      const used = await this.prisma.$queryRawUnsafe<{ used: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM "${dependent.table}" WHERE "${dependent.column}" = $1) AS used`,
        id,
      );
      if (used[0]?.used) found.push(dependent.label);
    }
    return found;
  }

  /** Rails Category#delete_associated_subcategories: unlink, and delete subjects left with no grade. */
  private async removeGradeFromSubjects(gradeId: bigint) {
    const links = await this.prisma.gradeSubject.findMany({ where: { gradeId } });
    await this.prisma.gradeSubject.deleteMany({ where: { gradeId } });
    for (const link of links) {
      const remaining = await this.prisma.gradeSubject.count({ where: { subjectId: link.subjectId } });
      if (remaining) continue;
      const blocking = await this.blockingDependents(LEVELS.subjects, link.subjectId);
      if (blocking.length) continue;
      await this.prisma.subject.delete({ where: { id: link.subjectId } }).catch(() => undefined);
      await this.storage.purgeAll(LEVELS.subjects.recordType, link.subjectId);
    }
  }
}
