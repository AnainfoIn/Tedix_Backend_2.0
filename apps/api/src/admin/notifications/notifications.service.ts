import { Injectable, NotFoundException } from '@nestjs/common';
import { FieldErrors, throwIfErrors } from '../../common/validation-error';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService, UploadedFile } from '../../storage/storage.service';

/**
 * Port of the ActiveAdmin "Notifications" page (app/admin/notifications.rb) and
 * BxBlockNotifications::UnifiedNotification with its in-app, push, email and SMS parts.
 *
 * The panel sends one flat record: the four channel switches, each channel's fields with a
 * prefix (inappSubject, pushContent, smsFooter ...), the schedule, and the targeting lists.
 */
type Row = Record<string, any>;
type Db = Pick<PrismaService, '$queryRawUnsafe' | '$executeRawUnsafe'>;

const INAPP = 'BxBlockNotifications::AdminInappNotification';
const PUSH = 'BxBlockNotifications::AdminPushNotification';
const EMAIL = 'BxBlockNotifications::AdminEmailNotification';

export const SCHEDULE_TYPES = ['now', 'once', 'daily', 'weekly', 'monthly'];
const SCHEDULE_LABELS: Record<string, string> = { now: 'Run Now', once: 'Schedule Once', daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** targeting_settings keys, the panel field that edits each, and the label in summaries. */
export const TARGETING: Array<[key: string, field: string, label: string]> = [
  ['country', 'targetCountry', 'Countries'],
  ['city', 'targetCity', 'Cities'],
  ['school', 'targetSchool', 'Schools'],
  ['grade', 'targetGrade', 'Grades'],
  ['account_type', 'targetAccountType', 'Account Types'],
  ['avatar_health', 'targetAvatarHealth', 'Avatar Health'],
  ['premium_status', 'targetPremiumStatus', 'Premium Status'],
  ['sponsor', 'targetSponsor', 'Sponsors'],
  ['campaign', 'targetCampaign', 'Campaigns'],
];

const CHANNELS = {
  inapp: { table: 'admin_inapp_notifications', recordType: INAPP, label: 'Admin inapp notification' },
  push: { table: 'admin_push_notifications', recordType: PUSH, label: 'Admin push notification' },
  email: { table: 'admin_email_notifications', recordType: EMAIL, label: 'Admin email notification' },
  sms: { table: 'admin_sms_notifications', recordType: null, label: 'Admin sms notification' },
} as const;
type Channel = keyof typeof CHANNELS;
const CHANNEL_KEYS = Object.keys(CHANNELS) as Channel[];

const IMAGE_TYPES = ['png', 'svg', 'jpeg', 'jpg', 'webp'];

const list = (value: unknown): string[] => {
  if (value === undefined || value === null || value === '') return [];
  const items = Array.isArray(value) ? value : typeof value === 'string' && value.startsWith('[') ? safeJson(value) : [value];
  return [...new Set(items.map((v) => String(v).trim()).filter(Boolean))];
};
const safeJson = (s: string): unknown[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [s];
  } catch {
    return [s];
  }
};
const truthy = (v: unknown) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';
const blank = (v: unknown) => v === undefined || v === null || String(v).trim() === '';
const text = (v: unknown) => (blank(v) ? null : String(v));

/** ActionText body from the plain text the form sends (the Rails form edits `to_plain_text`). */
const toRichText = (plain: string) =>
  `<div>${plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>')}</div>`;
const toPlainText = (html: string | null) =>
  (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: { skip: number; take: number; sortField: string; sortOrder: 'asc' | 'desc'; filters: Record<string, unknown> }) {
    const conds: string[] = [];
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    for (const key of CHANNEL_KEYS) {
      const v = query.filters[key];
      if (v !== undefined && v !== '') conds.push(`n.${key} = ${add(truthy(v))}`);
    }
    if (!blank(query.filters.status)) conds.push(`n.status = ${add(String(query.filters.status))}`);
    if (!blank(query.filters.scheduleType)) conds.push(`n.schedule_type = ${add(String(query.filters.scheduleType))}`);
    for (const [field, column] of [['scheduleTime', 'schedule_time'], ['createdAt', 'created_at']]) {
      const from = query.filters[`${field}_gte`];
      const to = query.filters[`${field}_lte`];
      if (typeof from === 'string' && /^\d{4}-\d{2}-\d{2}/.test(from)) conds.push(`n.${column} >= ${add(from)}::timestamp`);
      if (typeof to === 'string' && /^\d{4}-\d{2}-\d{2}/.test(to)) conds.push(`n.${column} < ${add(to.slice(0, 10))}::date + 1`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const sortable: Record<string, string> = { id: 'n.id', status: 'n.status', createdAt: 'n.created_at', scheduleTime: 'n.schedule_time' };
    const order = `${sortable[query.sortField] ?? 'n.id'} ${query.sortOrder === 'desc' ? 'DESC' : 'ASC'} NULLS LAST, n.id`;
    const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM unified_notifications n ${where}`, ...params);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT n.* FROM unified_notifications n ${where} ORDER BY ${order} LIMIT ${query.take} OFFSET ${query.skip}`,
      ...params,
    );
    const data = [];
    for (const row of rows) data.push(await this.present(row, false));
    return { data, total: Number(count) };
  }

  async many(ids: bigint[]) {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM unified_notifications WHERE id = ANY($1::bigint[]) ORDER BY id', ids);
    const data = [];
    for (const row of rows) data.push(await this.present(row, false));
    return { data, total: data.length };
  }

  async get(id: bigint) {
    return this.present(await this.find(id), true);
  }

  async create(input: Row, files: Record<string, UploadedFile[] | undefined>) {
    return this.save(null, input, files);
  }

  async update(id: bigint, input: Row, files: Record<string, UploadedFile[] | undefined>) {
    return this.save(await this.find(id), input, files);
  }

  async remove(id: bigint) {
    const record = await this.get(id);
    const parts = await this.channelRows(id);
    await this.prisma.$transaction(async (tx) => {
      for (const key of CHANNEL_KEYS) {
        const part = parts[key];
        if (!part) continue;
        const { table, recordType } = CHANNELS[key];
        if (recordType) await tx.$executeRawUnsafe(`DELETE FROM action_text_rich_texts WHERE record_type = $1 AND record_id = $2`, recordType, part.id);
        if (key === 'inapp') await tx.$executeRawUnsafe('DELETE FROM notifications WHERE admin_notification_id = $1', part.id);
        await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = $1`, part.id);
      }
      await tx.$executeRawUnsafe('DELETE FROM unified_notifications WHERE id = $1', id);
    });
    if (parts.inapp) await this.storage.purgeAll(INAPP, parts.inapp.id).catch(() => undefined);
    return record;
  }

  /** Distinct cities, schools or grades of students in the chosen countries (Rails `country_data`). */
  async options(type: string, countries: string[], cities: string[], schools: string[]) {
    const column = { cities: 'city', schools: 'school', grades: 'grade' }[type];
    if (!column || !countries.length) return [];
    const params: unknown[] = [countries];
    let where = 'p.app_country_id IN (SELECT id FROM account_block_countries WHERE name = ANY($1::text[]))';
    if (cities.length) {
      params.push(cities);
      where += ` AND p.city = ANY($${params.length}::text[])`;
    }
    if (schools.length) {
      params.push(schools);
      where += ` AND p.school = ANY($${params.length}::text[])`;
    }
    const rows = await this.prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT DISTINCT p.${column} AS v FROM bx_block_profile_profiles p WHERE ${where} AND p.${column} IS NOT NULL AND p.${column} <> '' ORDER BY 1`,
      ...params,
    );
    return rows.map((r) => r.v);
  }

  // --- internals -------------------------------------------------------------------------------

  private async find(id: bigint): Promise<Row> {
    const [row] = await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM unified_notifications WHERE id = $1', id);
    if (!row) throw new NotFoundException('Notification not found');
    return row;
  }

  private async channelRows(id: bigint): Promise<Partial<Record<Channel, Row>>> {
    const out: Partial<Record<Channel, Row>> = {};
    for (const key of CHANNEL_KEYS) {
      const [row] = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM ${CHANNELS[key].table} WHERE unified_notification_id = $1 ORDER BY id LIMIT 1`, Number(id));
      if (row) out[key] = row;
    }
    return out;
  }

  private async richText(recordType: string, id: bigint): Promise<string | null> {
    const [row] = await this.prisma.$queryRawUnsafe<{ body: string | null }[]>(
      `SELECT body FROM action_text_rich_texts WHERE record_type = $1 AND record_id = $2 AND name = 'content' LIMIT 1`,
      recordType,
      id,
    );
    return row?.body ?? null;
  }

  private settingsOf(row: Row): Record<string, string[]> {
    const raw = row.targeting_settings && typeof row.targeting_settings === 'object' ? row.targeting_settings : {};
    return Object.fromEntries(TARGETING.map(([key]) => [key, list(raw[key])]));
  }

  /** UnifiedNotification#targeted_accounts: students of the chosen countries, narrowed by any OR'ed criteria. */
  private targetingSql(settings: Record<string, string[]>, params: unknown[]): string | null {
    if (!settings.country.length) return null;
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const base = `a.id IN (SELECT p0.account_id FROM bx_block_profile_profiles p0 WHERE p0.app_country_id IN (SELECT id FROM account_block_countries WHERE name = ANY(${add(settings.country)}::text[])))`;
    const ors: string[] = [];
    const { city, school, grade } = settings;
    if (city.length) ors.push(`p.city = ANY(${add(city)}::text[])`);
    if (school.length) ors.push(`p.school = ANY(${add(school)}::text[])${city.length ? ` AND p.city = ANY(${add(city)}::text[])` : ''}`);
    if (grade.length) {
      let cond = `p.grade = ANY(${add(grade)}::text[])`;
      if (school.length) cond += ` AND p.school = ANY(${add(school)}::text[])`;
      if (city.length) cond += ` AND p.city = ANY(${add(city)}::text[])`;
      ors.push(cond);
    }
    // Rails compares role names case-sensitively against 'Student'/'Teacher'/... while the form sends
    // lowercase values, so the filter never matched; here it matches the role name ignoring case.
    if (settings.account_type.length) ors.push(`lower(r.name) = ANY(${add(settings.account_type.map((t) => t.toLowerCase()))}::text[])`);
    if (settings.avatar_health.length) ors.push(`p.avatar_health = ANY(${add(settings.avatar_health)}::text[])`);
    const premium = settings.premium_status;
    if (premium.includes('premium')) ors.push('(a.payment_premium = true OR a.learning_premium = true)');
    if (premium.includes('freemium') || premium.includes('free')) ors.push('(COALESCE(a.payment_premium, false) = false AND COALESCE(a.learning_premium, false) = false)');
    // Sponsor and campaign targeting is a placeholder in Rails too (no condition).
    return ors.length ? `${base} AND (${ors.map((c) => `(${c})`).join(' OR ')})` : base;
  }

  private async counts(row: Row) {
    const params: unknown[] = [];
    const sql = this.targetingSql(this.settingsOf(row), params);
    const manualIds = (Array.isArray(row.account_ids) ? row.account_ids : []).filter((v: unknown) => v != null).map((v: unknown) => Number(v));
    const from = `accounts a JOIN bx_block_profile_profiles p ON p.account_id = a.id LEFT JOIN roles r ON r.id = a.role_id`;
    let targeted = 0;
    let total = 0;
    if (sql) {
      const [{ count }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(DISTINCT a.id)::bigint AS count FROM ${from} WHERE ${sql}`, ...params);
      targeted = Number(count);
    }
    params.push(manualIds);
    const manualParam = `$${params.length}`;
    const [{ count: all }] = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM accounts WHERE id IN (${sql ? `SELECT a.id FROM ${from} WHERE ${sql} UNION ` : ''}SELECT unnest(${manualParam}::bigint[]))`,
      ...params,
    );
    total = Number(all);
    return { targetedAccountsCount: targeted, manualAccountsCount: manualIds.length, totalAccountsCount: total };
  }

  private scheduleText(row: Row): string {
    const time = row.schedule_time ? new Date(row.schedule_time) : null;
    const hm = time ? time.toISOString().slice(11, 16) : '';
    const interval = Number(row.recurrence_interval ?? 1);
    switch (row.schedule_type) {
      case 'now':
        return 'Run Now';
      case 'once':
        return `Once at ${time ? time.toISOString().slice(0, 16).replace('T', ' ') : ''}`;
      case 'daily':
        return `${interval === 1 ? 'Daily' : `Every ${interval} days`} at ${hm}`;
      case 'weekly':
        return `Weekly on ${this.weekdays(row).map((d) => DAY_NAMES[d] ?? d).join(', ')} at ${hm}`;
      case 'monthly':
        return `${interval === 1 ? 'Monthly' : `Every ${interval} months`} on day ${row.recurrence_day_of_month ?? ''} at ${hm}`;
      default:
        return row.schedule_type ?? '';
    }
  }

  private weekdays(row: Row): number[] {
    return Array.isArray(row.recurrence_weekday) ? row.recurrence_weekday.map(Number).filter((n: number) => Number.isInteger(n)) : [];
  }

  private async present(row: Row, full: boolean): Promise<Row> {
    const settings = this.settingsOf(row);
    const types = [row.inapp && 'In-App', row.push && 'Push', row.email && 'Email', row.sms && 'SMS'].filter(Boolean).join(', ');
    const summary = TARGETING.filter(([key]) => settings[key].length).map(([key, , label]) => `${label}: ${settings[key].join(', ')}`).join(' | ');
    const out: Row = {
      id: Number(row.id),
      inapp: !!row.inapp,
      push: !!row.push,
      email: !!row.email,
      sms: !!row.sms,
      types,
      targetingSummary: summary || 'No targeting set',
      status: row.status,
      scheduleType: row.schedule_type,
      scheduleText: this.scheduleText(row),
      scheduleTime: row.schedule_time,
      recurrenceInterval: row.recurrence_interval,
      recurrenceWeekday: this.weekdays(row),
      recurrenceDayOfMonth: row.recurrence_day_of_month,
      endTime: row.end_time,
      accountIds: (Array.isArray(row.account_ids) ? row.account_ids : []).map(Number),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...Object.fromEntries(TARGETING.map(([key, field]) => [field, settings[key]])),
      ...(await this.counts(row)),
    };
    if (!full) return out;
    const parts = await this.channelRows(BigInt(row.id));
    if (parts.inapp) {
      const p = parts.inapp;
      const files = await this.storage.filesFor(INAPP, BigInt(p.id), ['image_for_notification']);
      Object.assign(out, {
        inappSubject: p.subject,
        inappContent: toPlainText(await this.richText(INAPP, BigInt(p.id))),
        inappOnlyInformative: !!p.only_informative,
        inappIsButton: !!p.is_button,
        inappButtonUrl: p.button_url,
        inappButtonContent: p.button_content,
        inappImage: files.image_for_notification,
      });
    }
    if (parts.push) Object.assign(out, { pushSubject: parts.push.subject, pushContent: toPlainText(await this.richText(PUSH, BigInt(parts.push.id))) });
    if (parts.email) Object.assign(out, { emailSubject: parts.email.subject, emailContent: toPlainText(await this.richText(EMAIL, BigInt(parts.email.id))) });
    if (parts.sms) {
      const s = parts.sms;
      Object.assign(out, {
        smsName: s.name,
        smsMainBody: s.main_body,
        smsMedianGrade: !!s.median_grade,
        smsSponsorMessage: !!s.sponsor_message,
        smsSponsorBody: s.sponsor_body,
        smsFooter: s.footer,
        smsLastSentAt: s.last_sms_send_at,
      });
    }
    return out;
  }

  private async save(current: Row | null, input: Row, files: Record<string, UploadedFile[] | undefined>) {
    const errors: FieldErrors = {};
    const add = (field: string, message: string) => (errors[field] ??= []).push(message);
    const pick = <T>(field: string, fallback: T, parse: (v: unknown) => T): T => (field in input ? parse(input[field]) : fallback);

    const channels = Object.fromEntries(CHANNEL_KEYS.map((key) => [key, pick(key, current ? !!current[key] : false, truthy)])) as Record<Channel, boolean>;
    if (!CHANNEL_KEYS.some((key) => channels[key])) add('base', 'At least one notification type must be selected');

    const oldSettings = current ? this.settingsOf(current) : Object.fromEntries(TARGETING.map(([key]) => [key, [] as string[]]));
    const settings: Record<string, string[]> = {};
    for (const [key, field] of TARGETING) {
      const values = pick(field, oldSettings[key], list);
      if (values.length) settings[key] = values;
    }
    if (!Object.keys(settings).length) add('targetCountry', "Targeting settings can't be blank");

    const scheduleType = pick('scheduleType', current?.schedule_type ?? 'now', (v) => String(v ?? 'now'));
    if (!SCHEDULE_TYPES.includes(scheduleType)) add('scheduleType', 'Schedule type is not included in the list');
    const date = (field: string, fallback: unknown) =>
      pick(field, fallback ?? null, (v) => {
        if (blank(v)) return null;
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) {
          add(field, 'is not a valid date');
          return null;
        }
        return d;
      });
    const int = (field: string, fallback: unknown) =>
      pick(field, fallback ?? null, (v) => {
        if (blank(v)) return null;
        if (!/^-?\d+$/.test(String(v).trim())) {
          add(field, 'is not a number');
          return null;
        }
        return Number(v);
      });
    const scheduleTime = date('scheduleTime', current?.schedule_time);
    const endTime = date('endTime', current?.end_time);
    const recurrenceInterval = int('recurrenceInterval', current?.recurrence_interval ?? 1) ?? 1;
    const recurrenceDay = int('recurrenceDayOfMonth', current?.recurrence_day_of_month);
    const weekdays = pick('recurrenceWeekday', current ? this.weekdays(current) : [], (v) => list(v).map(Number).filter((n) => n >= 0 && n <= 6));
    const status = pick('status', current?.status ?? 'draft', (v) => text(v) ?? 'draft');
    const accountIds = pick('accountIds', current?.account_ids ?? [], (v) => list(v).filter((x) => /^\d+$/.test(x)).map(Number));

    // Channel parts: validated only for the switched-on channels (the Rails controller drops the others).
    const parts = current ? await this.channelRows(BigInt(current.id)) : {};
    const val = (field: string, existing: unknown) => pick(field, existing ?? null, text);
    const bool = (field: string, existing: unknown) => pick(field, !!existing, truthy);
    const inapp = {
      subject: val('inappSubject', parts.inapp?.subject),
      content: pick('inappContent', null as string | null, text),
      only_informative: bool('inappOnlyInformative', parts.inapp?.only_informative),
      is_button: bool('inappIsButton', parts.inapp?.is_button),
      button_url: val('inappButtonUrl', parts.inapp?.button_url),
      button_content: val('inappButtonContent', parts.inapp?.button_content),
    };
    const push = { subject: val('pushSubject', parts.push?.subject), content: pick('pushContent', null as string | null, text) };
    const email = { subject: val('emailSubject', parts.email?.subject), content: pick('emailContent', null as string | null, text) };
    const sms = {
      name: val('smsName', parts.sms?.name),
      main_body: val('smsMainBody', parts.sms?.main_body),
      median_grade: bool('smsMedianGrade', parts.sms?.median_grade),
      sponsor_message: bool('smsSponsorMessage', parts.sms?.sponsor_message),
      sponsor_body: val('smsSponsorBody', parts.sms?.sponsor_body),
      footer: val('smsFooter', parts.sms?.footer),
    };
    const image = files.inappImage?.[0];
    if (channels.inapp) {
      if (!inapp.subject) add('inappSubject', `${CHANNELS.inapp.label} subject can't be blank`);
      if (image && !(image.mimetype.split('/') as string[]).some((p) => IMAGE_TYPES.includes(p))) {
        add('inappImage', `${CHANNELS.inapp.label} image for notification must be a PNG, SVG, JPEG, or JPG file`);
      }
    }
    if (channels.push && !push.subject) add('pushSubject', `${CHANNELS.push.label} subject can't be blank`);
    if (channels.email && !email.subject) add('emailSubject', `${CHANNELS.email.label} subject can't be blank`);
    if (channels.sms) {
      if (!sms.name) add('smsName', `${CHANNELS.sms.label} name can't be blank`);
      if (!sms.main_body) add('smsMainBody', `${CHANNELS.sms.label} main body can't be blank`);
      if (!sms.footer) add('smsFooter', `${CHANNELS.sms.label} footer can't be blank`);
      if (sms.sponsor_message && !sms.sponsor_body) add('smsSponsorBody', `${CHANNELS.sms.label} sponsor body can't be blank`);
    }
    throwIfErrors(errors);

    const columns: Row = {
      inapp: channels.inapp,
      push: channels.push,
      email: channels.email,
      sms: channels.sms,
      targeting_settings: JSON.stringify(settings),
      account_ids: accountIds,
      status,
      schedule_type: scheduleType,
      schedule_time: scheduleTime,
      recurrence_interval: recurrenceInterval,
      recurrence_weekday: JSON.stringify(weekdays),
      recurrence_day_of_month: recurrenceDay,
      end_time: endTime,
    };
    const casts: Row = { targeting_settings: 'jsonb', account_ids: 'int4[]', recurrence_weekday: 'jsonb', schedule_time: 'timestamp', end_time: 'timestamp', recurrence_interval: 'int4', recurrence_day_of_month: 'int4' };
    const keys = Object.keys(columns);
    const placeholder = (k: string, i: number) => `$${i}${casts[k] ? `::${casts[k]}` : ''}`;

    let inappId: bigint | null = null;
    const id = await this.prisma.$transaction(async (tx) => {
      let id: bigint;
      if (current) {
        id = BigInt(current.id);
        await tx.$executeRawUnsafe(
          `UPDATE unified_notifications SET ${keys.map((k, i) => `${k} = ${placeholder(k, i + 2)}`).join(', ')}, updated_at = now() WHERE id = $1`,
          id,
          ...keys.map((k) => columns[k]),
        );
      } else {
        const [row] = await tx.$queryRawUnsafe<{ id: bigint }[]>(
          `INSERT INTO unified_notifications (${keys.join(', ')}, created_at, updated_at) VALUES (${keys.map((k, i) => placeholder(k, i + 1)).join(', ')}, now(), now()) RETURNING id`,
          ...keys.map((k) => columns[k]),
        );
        id = row.id;
      }
      inappId = await this.savePart(tx, id, 'inapp', channels.inapp, parts.inapp, { subject: inapp.subject, only_informative: inapp.only_informative, is_button: inapp.is_button, button_url: inapp.button_url, button_content: inapp.button_content }, inapp.content);
      await this.savePart(tx, id, 'push', channels.push, parts.push, { subject: push.subject }, push.content);
      await this.savePart(tx, id, 'email', channels.email, parts.email, { subject: email.subject }, email.content);
      await this.savePart(tx, id, 'sms', channels.sms, parts.sms, sms, null);
      return id;
    });
    if (inappId && image) await this.storage.attach(INAPP, inappId, 'image_for_notification', image);
    else if (inappId && truthy(input.removeInappImage)) await this.storage.purge(INAPP, inappId, 'image_for_notification');
    if (!channels.inapp && parts.inapp) await this.storage.purgeAll(INAPP, BigInt(parts.inapp.id)).catch(() => undefined);
    return this.get(id);
  }

  /** Creates, updates or (when the channel is switched off) removes one channel part with its rich text. */
  private async savePart(tx: Db, id: bigint, key: Channel, on: boolean, existing: Row | undefined, values: Row, content: string | null): Promise<bigint | null> {
    const { table, recordType } = CHANNELS[key];
    if (!on) {
      // before_save :cleanup_unused_notifications (dependent parts are destroyed).
      if (existing) {
        if (recordType) await tx.$executeRawUnsafe('DELETE FROM action_text_rich_texts WHERE record_type = $1 AND record_id = $2', recordType, existing.id);
        if (key === 'inapp') await tx.$executeRawUnsafe('DELETE FROM notifications WHERE admin_notification_id = $1', existing.id);
        await tx.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = $1`, existing.id);
      }
      return null;
    }
    const keys = Object.keys(values);
    let partId: bigint;
    if (existing) {
      partId = BigInt(existing.id);
      await tx.$executeRawUnsafe(`UPDATE ${table} SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, partId, ...keys.map((k) => values[k]));
    } else {
      const [row] = await tx.$queryRawUnsafe<{ id: bigint }[]>(
        `INSERT INTO ${table} (unified_notification_id, ${keys.join(', ')}, created_at, updated_at) VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}, now(), now()) RETURNING id`,
        Number(id),
        ...keys.map((k) => values[k]),
      );
      partId = row.id;
    }
    if (recordType && content !== null) {
      const body = toRichText(content);
      const updated = await tx.$executeRawUnsafe(
        `UPDATE action_text_rich_texts SET body = $3, updated_at = now() WHERE record_type = $1 AND record_id = $2 AND name = 'content'`,
        recordType,
        partId,
        body,
      );
      if (!updated) {
        await tx.$executeRawUnsafe(
          `INSERT INTO action_text_rich_texts (name, body, record_type, record_id, created_at, updated_at) VALUES ('content', $3, $1, $2, now(), now())`,
          recordType,
          partId,
          body,
        );
      }
    }
    return partId;
  }
}
