import { baseError } from '../../../common/validation-error';
import { ResourceHooks, ValidateArgs } from '../hooks';

/**
 * Draft → published → closed competitions (campaigns, weekly challenges, TIP competitions),
 * as in the Rails models: dates in the future, end after start, and once a competition is
 * live (published and started, or has activity) most fields are locked and the end date can
 * only be extended; once closed or ended nothing but nothing changes.
 */
export interface LifecycleOptions {
  noun: string;
  table: string;
  start: string;
  end: string;
  /** Start must be today or later: compared by day (campaigns) or by time. */
  startByDay?: boolean;
  /** Fields that cannot change once live. */
  locked: string[];
  /** Tables whose rows count as activity (has_many ... exists?). */
  activity: Array<{ table: string; column: string }>;
  /** Wording for "live" in the lock message. */
  liveWords?: string;
}

const DRAFT = 0;
const PUBLISHED = 1;
const CLOSED = 2;

const time = (v: unknown) => (v instanceof Date ? v : v ? new Date(String(v)) : null);
const same = (a: unknown, b: unknown) => {
  if (a instanceof Date || b instanceof Date) return time(a)?.getTime() === time(b)?.getTime();
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify((a as unknown[] ?? []).map(String)) === JSON.stringify((b as unknown[] ?? []).map(String));
  return String(a ?? '') === String(b ?? '');
};

export function lifecycleHooks(o: LifecycleOptions): ResourceHooks {
  const hasActivity = async (prisma: any, id: unknown) => {
    for (const a of o.activity) {
      const rows = await prisma.$queryRawUnsafe(`SELECT 1 FROM "${a.table}" WHERE "${a.column}" = $1 LIMIT 1`, BigInt(id as number)).catch(() => []);
      if (rows.length) return true;
    }
    return false;
  };
  return {
    async validate({ prisma }, { values, current, input, add }: ValidateArgs) {
      const now = new Date();
      const start = time(values[o.start]);
      const end = time(values[o.end]);
      const changed = (field: string) => current === null || (field in input && !same(values[field], current[field]));
      const status = Number(values.status);

      if (start && changed(o.start)) {
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        if (start < (o.startByDay ? today : now)) add(o.start, `${label(o.start)} must be today or a future date`);
      }
      if (end && (changed(o.end) || changed(o.start))) {
        if (start) {
          if (end <= start) add(o.end, `${label(o.end)} must be after start date`);
        } else if (end <= now) add(o.end, `${label(o.end)} must be a future date`);
      }
      if (changed('status') && status === PUBLISHED && end && end <= now) {
        add('status', 'Status cannot be published because the end date has already passed');
      }
      if (!current) return;

      const wasStatus = Number(current.status);
      const wasStart = time(current[o.start]);
      const wasEnd = time(current[o.end]);
      const fullyLocked = wasStatus === CLOSED || (!!wasEnd && wasEnd <= now);
      const locked = (wasStatus === PUBLISHED && !!wasStart && wasStart <= now) || (await hasActivity(prisma, current.id));
      if (locked) {
        for (const field of o.locked) {
          if (field in input && !same(values[field], current[field])) {
            add(field, `${label(field)} cannot be changed once the ${o.noun} is ${o.liveWords ?? 'live or has activity'}`);
          }
        }
      }
      if (changed('status')) {
        if (fullyLocked) add('status', `Status cannot be changed once the ${o.noun} is closed or has ended`);
        else if (locked && !(wasStatus === PUBLISHED && status === CLOSED)) add('status', `Status can only move from published to closed once live`);
      }
      if (changed(o.end)) {
        if (fullyLocked) add(o.end, `${label(o.end)} cannot be changed once the ${o.noun} is closed or has ended`);
        else if (locked && end && wasEnd && end < wasEnd) add(o.end, `${label(o.end)} cannot be shortened once the ${o.noun} is live — you can only extend it`);
      }
    },
    async beforeDelete({ prisma }, id, current) {
      const start = time(current[o.start]);
      const visible = Number(current.status) === PUBLISHED && !!start && start <= new Date();
      if (visible || (await hasActivity(prisma, id))) baseError(`Cannot be deleted once the ${o.noun} is live or has activity`);
    },
  };
}

function label(field: string) {
  const words = field.replace(/Id(s?)$/, '$1').replace(/([A-Z])/g, ' $1').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
