/**
 * Port of Ga4::DateRange: the period every GA4 analytics page shows, from `preset`, `from`, `to`.
 * Dates are ISO strings (YYYY-MM-DD) in UTC, like Rails' Date.current on a UTC app.
 */
export const PRESETS: Record<string, string> = {
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  last_6_months: 'Last 6 months',
  custom: 'Custom range',
};
const DEFAULT_PRESET = 'last_30_days';
const EARLIEST = '2015-08-14';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type Granularity = 'date' | 'week' | 'month';

const DAY = 86_400_000;
export const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const today = () => iso(new Date());
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Monday of the ISO week of a date. */
export function weekStart(s: string): string {
  const d = toDate(s);
  return addDays(s, -((d.getUTCDay() + 6) % 7));
}
export const monthStart = (s: string) => `${s.slice(0, 7)}-01`;
function monthsBack(s: string, n: number): string {
  const d = toDate(s);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last))));
}

/** ISO week key YYYYWW (GA4 isoYearIsoWeek). */
export function weekKey(s: string): string {
  const d = toDate(s);
  const thursday = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}${pad(week)}`;
}
function weekKeyStart(key: string): string {
  const year = Number(key.slice(0, 4));
  const week = Number(key.slice(4, 6));
  const jan4 = iso(new Date(Date.UTC(year, 0, 4)));
  return addDays(weekStart(jan4), (week - 1) * 7);
}
export const shortDate = (s: string) => `${s.slice(8, 10)} ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
export const longDate = (s: string) => `${shortDate(s)} ${s.slice(0, 4)}`;

export function periodLabel(key: string, granularity: Granularity): string {
  if (granularity === 'date') return shortDate(`${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`);
  if (granularity === 'week') return `Wk of ${shortDate(weekKeyStart(key))}`;
  return `${MONTHS[Number(key.slice(4, 6)) - 1]} ${key.slice(0, 4)}`;
}

export class DateRange {
  readonly start: string;
  readonly end: string;

  constructor(start: string, end: string, readonly preset = 'custom') {
    const [first, last0] = start <= end ? [start, end] : [end, start];
    const last = last0 > today() ? today() : last0;
    let f = first < last ? first : last;
    if (f < EARLIEST) f = EARLIEST;
    this.start = f;
    this.end = last;
  }

  static fromParams(params: Record<string, unknown>): DateRange {
    let preset = typeof params.preset === 'string' && params.preset in PRESETS ? params.preset : undefined;
    const valid = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(toDate(v).getTime()) ? v : undefined);
    if (!preset && (params.from || params.to)) preset = 'custom';
    preset ??= DEFAULT_PRESET;
    if (preset === 'custom') {
      const from = valid(params.from);
      if (from) return new DateRange(from, valid(params.to) ?? today(), 'custom');
      preset = DEFAULT_PRESET;
    }
    return DateRange.forPreset(preset);
  }

  static forPreset(preset: string, now = today()): DateRange {
    switch (preset) {
      case 'last_7_days':
        return new DateRange(addDays(now, -6), now, preset);
      case 'last_90_days':
        return new DateRange(addDays(now, -89), now, preset);
      case 'this_month':
        return new DateRange(monthStart(now), now, preset);
      case 'last_month': {
        const first = monthStart(monthsBack(now, 1));
        return new DateRange(first, addDays(monthStart(now), -1), preset);
      }
      case 'last_6_months':
        return new DateRange(addDays(monthsBack(now, 6), 1), now, preset);
      default:
        return new DateRange(addDays(now, -29), now, 'last_30_days');
    }
  }

  get days(): number {
    return Math.round((toDate(this.end).getTime() - toDate(this.start).getTime()) / DAY) + 1;
  }
  previous(): DateRange {
    return new DateRange(addDays(this.start, -this.days), addDays(this.start, -1));
  }
  trailing(count: number): DateRange {
    return new DateRange(addDays(this.end, -(count - 1)), this.end);
  }
  atLeast(count: number): DateRange {
    return this.days >= count ? this : this.trailing(count);
  }
  aligned(g: Granularity): DateRange {
    if (g === 'week') return new DateRange(weekStart(this.start), this.end);
    if (g === 'month') return new DateRange(monthStart(this.start), this.end);
    return this;
  }
  toApi() {
    return { startDate: this.start, endDate: this.end };
  }
  get label(): string {
    return `${longDate(this.start)} – ${longDate(this.end)}`;
  }
  get granularity(): Granularity {
    if (this.days <= 45) return 'date';
    if (this.days <= 200) return 'week';
    return 'month';
  }
  /** Ordered GA4 period keys this range covers. */
  periods(g: Granularity): string[] {
    const keys: string[] = [];
    for (let d = this.start; d <= this.end; d = addDays(d, 1)) {
      const key = g === 'date' ? d.replace(/-/g, '') : g === 'week' ? weekKey(d) : d.slice(0, 7).replace('-', '');
      if (keys[keys.length - 1] !== key) keys.push(key);
    }
    return keys;
  }
}
