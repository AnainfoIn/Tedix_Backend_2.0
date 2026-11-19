import { DateRange, PRESETS, shortDate } from './date-range';
import { Ga4ConfigurationError, Ga4PermissionError } from './ga4-client';
import {
  EngagementReport, Ga4Report, LessonReport, Points, ProgressFeatureReport, RetentionReport, ShadowShieldReport, Step,
} from './reports';

/**
 * Page layouts for the Analytics menu, ported from app/admin/*_analytics.rb and AnalyticsUi.
 * The API returns ready-to-render blocks with numbers already formatted, so the admin panel
 * only draws them.
 */
type Tone = 'good' | 'warn' | 'bad' | null;
export type Kpi = { label: string; value: string; hint?: string; tone?: Tone };
export type Series = { name: string; points: Points };
export type ChartOptions = { height?: number; donut?: boolean; suffix?: string; max?: number; colors?: string[]; ytitle?: string };
export type Cell = string | { text: string; tone: Tone | 'none' };
export type Block =
  | { kind: 'kpis'; items: Kpi[] }
  | { kind: 'grid'; columns: number; cards: Block[] }
  | { kind: 'card'; title: string; description?: string; blocks: Block[] }
  | { kind: 'chart'; chart: 'line' | 'column' | 'bar' | 'pie'; series: Series[]; options?: ChartOptions }
  | { kind: 'funnel'; steps: Array<{ label: string; value: string; share: string; width: number; fromPrevious: string }>; empty: boolean }
  | { kind: 'table'; columns: Array<{ title: string; numeric: boolean }>; rows: Cell[][] }
  | { kind: 'definitions'; title: string; items: Array<[string, string]> };
export type Section = { title: string; description?: string; blocks: Block[] };
export type Page = {
  title: string;
  source: 'ga4' | 'db';
  range?: { preset: string; from: string; to: string; label: string; days: number; presets: Array<[string, string]> };
  countries?: string[];
  country?: string;
  unavailable?: { title: string; message: string; detail?: string };
  sections: Section[];
};

// Validated categorical palette (dataviz reference, light surface); fixed order, never cycled.
export const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];

// ------------------------------------------------------------------------------- formatting

export const fmt = {
  number(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    const n = Number(value);
    const rounded = Number.isInteger(n) ? n : Math.round(n * 10 ** digits) / 10 ** digits;
    return rounded.toLocaleString('en-US', { maximumFractionDigits: digits });
  },
  pct(value: number | null | undefined) {
    return value === null || value === undefined ? '—' : `${fmt.number(value)}%`;
  },
  change(value: number | null | undefined) {
    return value === null || value === undefined ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  },
  duration(seconds: number) {
    const s = Math.trunc(seconds || 0);
    return s < 60 ? `${s}s` : `${Math.trunc(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  },
  rateTone(value: number | null | undefined, sample = 1, good = 70, warn = 40): Tone {
    if (value === null || value === undefined || !sample) return null;
    return value >= good ? 'good' : value >= warn ? 'warn' : 'bad';
  },
  inverseTone(value: number | null | undefined, sample = 1, good = 20, warn = 40): Tone {
    if (value === null || value === undefined || !sample) return null;
    return value <= good ? 'good' : value <= warn ? 'warn' : 'bad';
  },
};

const humanize = (v: unknown) => {
  const s = String(v ?? '').replace(/_id$/, '').replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '—';
};

// ------------------------------------------------------------------------------- block helpers

const section = (title: string, description: string | undefined, ...blocks: Block[]): Section => ({ title, description, blocks });
const kpis = (items: Array<Kpi | null>): Block => ({ kind: 'kpis', items: items.filter((i): i is Kpi => !!i) });
const grid = (columns: number, ...cards: Block[]): Block => ({ kind: 'grid', columns, cards });
const card = (title: string, ...blocks: Block[]): Block => ({ kind: 'card', title, blocks });
const cardWith = (title: string, description: string, ...blocks: Block[]): Block => ({ kind: 'card', title, description, blocks });
const definitions = (items: Record<string, string>): Section =>
  section('Definitions', undefined, { kind: 'definitions', title: 'How these numbers are calculated', items: Object.entries(items) });

function chart(type: 'line' | 'column' | 'bar' | 'pie', data: Points | Record<string, Points>, options: ChartOptions = {}): Block {
  const series = Array.isArray(data) ? [{ name: '', points: data }] : Object.entries(data).map(([name, points]) => ({ name, points: points ?? [] }));
  return { kind: 'chart', chart: type, series, options };
}

function funnel(steps: Step[]): Block {
  const first = steps[0]?.value ?? 0;
  let previous: number | null = null;
  const rows = steps.map((step, i) => {
    const share = first > 0 ? Math.round((step.value / first) * 1000) / 10 : null;
    const rate = previous && previous > 0 ? Math.round((step.value / previous) * 1000) / 10 : null;
    previous = step.value;
    return {
      label: `${i + 1}. ${step.label}`,
      value: fmt.number(step.value),
      share: fmt.pct(share),
      width: share && share > 0 ? Math.max(share, 0.5) : 0,
      fromPrevious: rate !== null ? `${fmt.pct(rate)} from prev.` : '',
    };
  });
  return { kind: 'funnel', steps: rows, empty: !(first > 0) };
}

type Column<R> = { title: string; value: (row: R) => unknown; format?: 'number' | 'pct' | 'rate' | 'inverse_rate'; sample?: (row: R) => number };

function table<R>(rows: R[] | null | undefined, columns: Array<Column<R>>): Block {
  return {
    kind: 'table',
    columns: columns.map((c) => ({ title: c.title, numeric: !!c.format })),
    rows: (rows ?? []).map((row) =>
      columns.map((c): Cell => {
        const v = c.value(row) as number | null;
        switch (c.format) {
          case 'number':
            return fmt.number(v);
          case 'pct':
            return fmt.pct(v);
          case 'rate':
          case 'inverse_rate': {
            const sample = c.sample ? c.sample(row) : 1;
            const tone = c.format === 'rate' ? fmt.rateTone(v, sample) : fmt.inverseTone(v, sample);
            return { text: fmt.pct(v), tone: tone ?? 'none' };
          }
          default:
            return v === null || v === undefined || v === ('' as unknown) ? '—' : String(v);
        }
      }),
    ),
  };
}

const completion = (started: number, completed: number) => (started ? Math.min(Math.round((completed * 1000) / started) / 10, 100) : 0);

// ------------------------------------------------------------------------------- GA4 pages

type Builder = (data: any, range: DateRange) => Section[];

function engagement(data: any, range: DateRange): Section[] {
  const a = data.audience;
  const act = data.activity;
  const top = data.adoption.find((r: any) => r.users > 0);
  const change = data.activeChange;
  return [
    section('Overview', undefined, kpis([
      { label: 'Active users', value: fmt.number(a.active_users), hint: change !== null ? `${fmt.change(change)} vs previous period` : 'No previous data to compare', tone: change !== null ? (change >= 0 ? 'good' : 'bad') : null },
      { label: 'New users', value: fmt.number(a.new_users), hint: 'Opened the app for the first time' },
      { label: 'DAU', value: fmt.number(act.dau), hint: `On ${shortDate(range.end)} · avg ${fmt.number(act.avgDau)}/day` },
      { label: 'WAU', value: fmt.number(act.wau), hint: 'Active in the 7 days to the end date' },
      { label: 'MAU', value: fmt.number(act.mau), hint: 'Active in the 28 days to the end date' },
      { label: 'Stickiness (DAU / MAU)', value: fmt.pct(act.stickiness), hint: 'Share of monthly users active daily' },
      { label: 'Engagement time per user', value: fmt.duration(data.engagementPerUser), hint: 'Time with the app in the foreground' },
      { label: 'Sessions per user', value: fmt.number(data.sessionsPerUser), hint: 'Average in this period' },
      { label: 'Most used feature', value: top ? top.feature : '—', hint: top ? `${fmt.pct(top.adoption)} of active users` : 'No feature activity yet' },
    ])),
    section('Active users', 'Daily, 7-day and 28-day active users for each day of the period.', chart('line', act.trend, { height: 300 })),
    section('Feature adoption', 'Share of active users who used each feature in the period.',
      grid(2,
        card('Adoption by feature', chart('bar', data.adoption.map((r: any) => [r.feature, r.adoption]), { suffix: '%', max: 100 })),
        card('Users per feature', table<any>(data.adoption, [
          { title: 'Feature', value: (r) => r.feature },
          { title: 'Users', value: (r) => r.users, format: 'number' },
          { title: 'Share of active users', value: (r) => r.adoption, format: 'pct' },
        ])),
      ),
      cardWith('Feature usage over time', 'Unique users starting each activity per period.', chart('line', data.featureTrend, { height: 300 })),
    ),
    section('Audience', undefined,
      grid(3,
        card('New vs returning users', chart('pie', data.newVsReturning, { donut: true, height: 240 })),
        card('Platform', chart('pie', data.platforms.map((r: any) => [r.label, r.users]), { donut: true, height: 240 })),
        card('Device', chart('pie', data.devices.map((r: any) => [r.label, r.users]), { donut: true, height: 240 })),
      ),
      card('Top countries', chart('bar', data.countries.map((r: any) => [r.label, r.users]), { height: 300 })),
    ),
    definitions({
      'Active users': 'Google Analytics active users in the period, compared with the previous period of the same length.',
      'DAU / WAU / MAU': 'Users active in the 1, 7 and 28 days up to the last day of the period.',
      'Feature adoption': 'Lessons, Puzzle Mix, Weekly Challenges and Competitions: started or resumed. Shadows and Shields: activated.',
      'Engagement time': 'Google Analytics engagement time (app in the foreground) divided by active users.',
    }),
  ];
}

function retention(data: any): Section[] {
  const t = data.totals;
  const act = data.activity;
  const steps: Step[] = data.activation.steps;
  const rate = steps[0].value > 0 ? Math.round((steps[1].value / steps[0].value) * 1000) / 10 : null;
  const change = data.activeChange;
  return [
    section('Overview', undefined, kpis([
      { label: 'Sign-ups', value: fmt.number(t.sign_up.events), hint: 'New accounts in this period' },
      { label: 'Logins', value: fmt.number(t.login.events), hint: `${fmt.number(t.login.users)} users logged in` },
      { label: 'Logins per user', value: fmt.number(t.login.perUser), hint: 'Average for users who logged in' },
      { label: 'Logouts', value: fmt.number(t.logout.events), hint: `${fmt.pct(data.logoutRate)} of logins` },
      { label: 'Weekly returning users', value: fmt.number(t.weekly_returns.users), hint: 'Came back in a later week' },
      { label: 'Active users', value: fmt.number(data.activeUsers), hint: change !== null ? `${fmt.change(change)} vs previous period` : 'No previous data to compare', tone: change !== null ? (change >= 0 ? 'good' : 'bad') : null },
      { label: 'Stickiness (DAU / MAU)', value: fmt.pct(act.stickiness), hint: `DAU ${fmt.number(act.dau)} · MAU ${fmt.number(act.mau)}` },
      { label: 'Sign-up → first lesson', value: fmt.pct(rate), tone: fmt.rateTone(rate, steps[0].value), hint: `${fmt.number(steps[1].value)} of ${fmt.number(steps[0].value)} new users` },
    ])),
    section('Sign-ups', 'New accounts per day in the selected period, plus weekly (at least 8 weeks) and monthly (at least 6 months) views.',
      grid(3,
        card('Daily', chart('column', data.signups.daily)),
        card('Weekly', chart('column', data.signups.weekly)),
        card('Monthly', chart('column', data.signups.monthly)),
      )),
    section('Active users (DAU / WAU / MAU)', undefined, chart('line', act.trend, { height: 300 })),
    section('Logins & logouts', undefined,
      grid(2,
        card('Logins and logouts', chart('line', { Logins: data.authTrend.login, Logouts: data.authTrend.logout })),
        card('Users logging in', chart('column', data.loginUsers)),
      )),
    section('Weekly returning users', 'Users who came back in a later week than they signed up (weekly_returns, at most once per user per week). At least the last 8 full weeks.',
      chart('column', data.weeklyReturns, { ytitle: 'Users' })),
    section('Retention by first-use week', 'Users grouped by the week they first opened the app. Week N shows the share active again N weeks later. "—" means that week has not finished yet.',
      table<any>(data.cohorts, [
        { title: 'First used', value: (r) => r.label },
        { title: 'Users', value: (r) => r.size, format: 'number' },
        { title: 'Week 1', value: (r) => r.retention[0], format: 'pct' },
        { title: 'Week 2', value: (r) => r.retention[1], format: 'pct' },
        { title: 'Week 3', value: (r) => r.retention[2], format: 'pct' },
      ])),
    section('Sign-up → first lesson',
      data.activation.exact ? 'Users who signed up in this period, then started and completed a lesson (in that order).' : 'Unique users who did each step in this period.',
      funnel(steps)),
    definitions({
      'Sign-ups': 'sign_up events.',
      'Logins per user': 'login events ÷ users who logged in.',
      'Weekly returning users': 'Users with a weekly_returns event in the period.',
      'Retention by first-use week': 'Google Analytics cohorts based on the first time the app was opened.',
      'Sign-up → first lesson': 'Google Analytics funnel: sign_up, then lesson_started, then lesson_completed.',
    }),
  ];
}

function lessons(data: any): Section[] {
  const t = data.totals;
  const out: Section[] = [
    section('Overview', undefined, kpis([
      { label: 'Learners', value: fmt.number(data.learners), hint: 'Started or resumed a lesson' },
      { label: 'Lessons started', value: fmt.number(t.lesson_started.events) },
      { label: 'Lessons resumed', value: fmt.number(t.lesson_resumed.events), hint: `${fmt.pct(data.resumeShare)} of lesson sessions` },
      { label: 'Lessons completed', value: fmt.number(t.lesson_completed.events), hint: `${fmt.number(t.lesson_completed.users)} users` },
      { label: 'Completion rate', value: fmt.pct(data.completionRate), tone: fmt.rateTone(data.completionRate, t.lesson_started.events), hint: 'Completed ÷ started' },
      { label: 'Lesson exits', value: fmt.number(t.lesson_exited.events), hint: `${fmt.number(data.exitsPerLearner)} per learner` },
      { label: 'Exit rate', value: fmt.pct(data.exitRate), tone: fmt.inverseTone(data.exitRate, t.lesson_started.events + t.lesson_resumed.events), hint: 'Exits ÷ lesson sessions' },
    ])),
    section('Lesson funnel', data.funnel.exact ? 'Users who went through each step of a lesson, in this order, during the period.' : 'Unique users who did each step during the period.', funnel(data.funnel.steps)),
    section('Step completion', 'How often each part of a lesson is finished once it is started.', table<any>(data.stages, [
      { title: 'Step', value: (r) => r.stage },
      { title: 'Started', value: (r) => r.started, format: 'number' },
      { title: 'Finished', value: (r) => r.finished, format: 'number' },
      { title: 'Finished as', value: (r) => r.finishedLabel },
      { title: 'Users started', value: (r) => r.startedUsers, format: 'number' },
      { title: 'Users finished', value: (r) => r.finishedUsers, format: 'number' },
      { title: 'Completion', value: (r) => r.rate, format: 'rate', sample: (r) => r.started },
    ])),
    section('Lessons over time', undefined, grid(2,
      card('Lessons', chart('line', {
        Started: data.trend.lesson_started, Resumed: data.trend.lesson_resumed, Completed: data.trend.lesson_completed, Exited: data.trend.lesson_exited,
      })),
      card('Micro-lessons and exercises', chart('line', {
        'Micro-lessons started': data.stepTrend.micro_lesson_started,
        'Micro-lessons completed': data.stepTrend.micro_lesson_completed,
        'Exercises started': data.stepTrend.exercise_started,
        'Exercises completed': data.stepTrend.exercise_completed,
      })),
    )),
  ];
  if (data.exitSteps) {
    out.push(section('Where users exit', 'lesson_exited by exit step.',
      chart('pie', data.exitSteps.map((r: any) => [humanize(r.value), r.lesson_exited.events]), { donut: true, height: 260 })));
  }
  const pair = (rows: any[], title: string, noun: string, started: string, completed: string) =>
    section(title, `Most started ${title.toLowerCase()}.`, table<any>(rows, [
      { title: noun, value: (r) => r.value },
      { title: 'Started', value: (r) => r[started].events, format: 'number' },
      { title: 'Completed', value: (r) => r[completed].events, format: 'number' },
      { title: 'Completion', value: (r) => completion(r[started].events, r[completed].events), format: 'rate', sample: (r) => r[started].events },
    ]));
  if (data.lessons) out.push(pair(data.lessons, 'Lessons', 'Lesson', 'lesson_started', 'lesson_completed'));
  if (data.exercises) out.push(pair(data.exercises, 'Exercises', 'Exercise', 'exercise_started', 'exercise_completed'));
  out.push(definitions({
    Learners: 'Unique users with lesson_started or lesson_resumed.',
    'Completion rate': 'lesson_completed ÷ lesson_started (capped at 100%; lessons started earlier can be completed in this period).',
    'Lesson sessions': 'lesson_started + lesson_resumed. A session is either started or resumed, never both.',
    'Exit rate': 'lesson_exited ÷ lesson sessions. Exits include leaving the app or closing it during a lesson.',
    'Micro-lesson summaries': 'Counted when the video is played to the end or the last text section is reached.',
  }));
  return out;
}

function shadowsShields(data: any): Section[] {
  const out: Section[] = Object.values<any>(data.kinds).map((k) =>
    section(k.label, undefined, kpis([
      { label: `${k.label} unlocked`, value: fmt.number(k.unlocked.events), hint: `${fmt.number(k.unlocked.users)} users` },
      { label: `${k.label} activated`, value: fmt.number(k.activated.events), hint: `${fmt.number(k.activated.users)} users` },
      { label: 'Users unlocking', value: fmt.pct(k.unlockRate), hint: `Of ${fmt.number(data.activeUsers)} active users` },
      { label: 'Users activating', value: fmt.pct(k.activationRate), hint: `Of ${fmt.number(data.activeUsers)} active users` },
      { label: 'Activations per unlock', value: fmt.number(k.activationsPerUnlock), hint: 'Activations ÷ unlocks' },
      { label: 'Activations per user', value: fmt.number(k.activationsPerUser), hint: 'For users who activated' },
    ])),
  );
  out.push(section('Over time', undefined, grid(2,
    card('Events', chart('line', {
      'Shadows unlocked': data.trend.shadow_unlocked, 'Shadows activated': data.trend.shadow_activated,
      'Shields unlocked': data.trend.shield_unlocked, 'Shields activated': data.trend.shield_activated,
    })),
    card('Users', chart('line', {
      'Unlocking shadows': data.usersTrend.shadow_unlocked, 'Activating shadows': data.usersTrend.shadow_activated,
      'Unlocking shields': data.usersTrend.shield_unlocked, 'Activating shields': data.usersTrend.shield_activated,
    })),
  )));
  for (const [key, k] of Object.entries<any>(data.kinds)) {
    if (!k.items) continue;
    out.push(section(`${k.label} by name`, undefined, table<any>(k.items, [
      { title: k.singular, value: (r) => r.value },
      { title: 'Unlocked', value: (r) => r[`${key}_unlocked`].events, format: 'number' },
      { title: 'Activated', value: (r) => r[`${key}_activated`].events, format: 'number' },
      { title: 'Users activating', value: (r) => r[`${key}_activated`].users, format: 'number' },
    ])));
  }
  out.push(definitions({
    'Users unlocking / activating': 'Unique users with an unlocked / activated event ÷ Google Analytics active users.',
    'Activations per unlock': 'Activated events ÷ unlocked events in the period.',
  }));
  return out;
}

/** AnalyticsUi::ProgressFeature, for Puzzle Mix, Weekly Challenges and Competitions. */
function progressFeature(prefix: string, noun: string, progress: string): Builder {
  const ev = (s: string) => `${prefix}_${s}`;
  return (data) => {
    const t = data.totals;
    const [started, resumed, completed, exited] = ['started', 'resumed', 'completed', 'exited'].map((s) => t[ev(s)]);
    const sessions = started.events + resumed.events;
    const items: Kpi[] = [
      { label: 'Players', value: fmt.number(data.players), hint: `Started or resumed a ${noun}` },
      { label: 'Started', value: fmt.number(started.events), hint: `${fmt.number(started.users)} users` },
      { label: 'Resumed', value: fmt.number(resumed.events), hint: `${fmt.pct(data.resumeShare)} of sessions` },
      { label: 'Completed', value: fmt.number(completed.events), hint: `${fmt.number(completed.users)} users` },
      { label: 'Exited', value: fmt.number(exited.events), hint: `${fmt.number(exited.users)} users` },
      { label: 'Completion rate', value: fmt.pct(data.completionRate), tone: fmt.rateTone(data.completionRate, started.events), hint: 'Completed ÷ started' },
      { label: 'Exit rate', value: fmt.pct(data.exitRate), tone: fmt.inverseTone(data.exitRate, sessions), hint: 'Exits ÷ sessions' },
      { label: 'Completions per player', value: fmt.number(data.completionsPerPlayer) },
    ];
    if (data.progressAtExit !== null || data.progressAtResume !== null) {
      items.push({ label: `${progress} at exit`, value: fmt.number(data.progressAtExit), hint: 'Average' });
      items.push({ label: `${progress} at resume`, value: fmt.number(data.progressAtResume), hint: 'Average' });
    }
    const out: Section[] = [
      section('Overview', undefined, kpis(items)),
      section('Started → completed',
        data.funnel.exact ? `Users who started or resumed a ${noun} and then completed one in this period.` : 'Unique users who did each step in this period.',
        grid(2,
          card('Player funnel', funnel(data.funnel.steps)),
          card('Completed vs exited', chart('pie', data.outcomes, { donut: true, height: 220, colors: [PALETTE[2], PALETTE[7]] })),
        )),
      section('Over time', undefined, chart('line', {
        Started: data.trend[ev('started')], Resumed: data.trend[ev('resumed')], Completed: data.trend[ev('completed')], Exited: data.trend[ev('exited')],
      }, { height: 300 })),
      section('Week over week', 'Unique users per week. At least the last 8 full weeks; the latest week may still be in progress.', chart('column', data.weekly, { height: 300 })),
    ];
    for (const d of data.breakdowns) {
      out.push(section(d.title, undefined, table<any>(d.rows, [
        { title: d.column, value: (r) => humanize(r.value) },
        { title: 'Started', value: (r) => r[ev('started')].events, format: 'number' },
        { title: 'Resumed', value: (r) => r[ev('resumed')].events, format: 'number' },
        { title: 'Completed', value: (r) => r[ev('completed')].events, format: 'number' },
        { title: 'Exited', value: (r) => r[ev('exited')].events, format: 'number' },
        { title: 'Completion', value: (r) => completion(r[ev('started')].events, r[ev('completed')].events), format: 'rate', sample: (r) => r[ev('started')].events },
      ])));
    }
    out.push(definitions({
      Players: `Unique users with ${ev('started')} or ${ev('resumed')}.`,
      Sessions: `${ev('started')} + ${ev('resumed')}. A session is either started or resumed, never both.`,
      'Completion rate': `${ev('completed')} ÷ ${ev('started')} (capped at 100%).`,
      'Exit rate': `${ev('exited')} ÷ sessions. Exits include leaving or closing the app.`,
    }));
    return out;
  };
}

type Ga4PageDef = { title: string; report: (range: DateRange, refresh: boolean) => Ga4Report<any>; build: Builder };

export const GA4_PAGES: Record<string, Ga4PageDef> = {
  engagement: { title: 'Engagement Overview', report: (r, f) => new EngagementReport(r, f), build: engagement },
  retention: { title: 'Sign-ups & Retention', report: (r, f) => new RetentionReport(r, f), build: (d) => retention(d) },
  lessons: { title: 'Lesson Analytics', report: (r, f) => new LessonReport(r, f), build: (d) => lessons(d) },
  'puzzle-mix': {
    title: 'Puzzle Mix Analytics',
    report: (r, f) => new ProgressFeatureReport(r, f, 'puzzle_mix', [['By lesson', 'lesson_name', 'Lesson']]),
    build: progressFeature('puzzle_mix', 'puzzle', 'Bars filled'),
  },
  'weekly-challenges': {
    title: 'Weekly Challenge Analytics',
    report: (r, f) => new ProgressFeatureReport(r, f, 'weekly_challenge', [['By challenge', 'weekly_challenge_name', 'Challenge']]),
    build: progressFeature('weekly_challenge', 'weekly challenge', 'Bars filled'),
  },
  competitions: {
    title: 'Competition Analytics',
    report: (r, f) => new ProgressFeatureReport(r, f, 'competition', [
      ['By competition type', 'competition_type', 'Type'],
      ['Periodic & special campaigns', 'campaign_name', 'Campaign'],
      ['Training units', 'unit_name', 'Unit'],
      ['TIP competitions', 'tip_competition_name', 'TIP competition'],
    ]),
    build: progressFeature('competition', 'competition', 'Correct answers'),
  },
  'shadows-shields': { title: 'Shadows & Shields Analytics', report: (r, f) => new ShadowShieldReport(r, f), build: (d) => shadowsShields(d) },
};

export async function ga4Page(key: string, range: DateRange, refresh: boolean): Promise<Page> {
  const def = GA4_PAGES[key];
  const report = def.report(range, refresh);
  const base: Page = {
    title: def.title,
    source: 'ga4',
    range: { preset: range.preset, from: range.start, to: range.end, label: range.label, days: range.days, presets: Object.entries(PRESETS) },
    sections: [],
  };
  const failure = await report.failure();
  if (failure) {
    const title = 'Google Analytics data is not available right now';
    if (failure instanceof Ga4PermissionError) {
      base.unavailable = {
        title,
        message: `The service account ${failure.serviceAccount ?? '(see GA4_SERVICE_ACCOUNT_JSON)'} does not have access to GA4 property ${failure.propertyId}. Add it as a Viewer under Admin → Property access management, then use "Refresh data".`,
      };
    } else if (failure instanceof Ga4ConfigurationError) {
      base.unavailable = { title, message: failure.message };
    } else {
      base.unavailable = { title, message: 'Google Analytics could not be reached. Please try again in a few minutes.', detail: failure.message };
    }
    return base;
  }
  base.sections = def.build(await report.data(), range);
  return base;
}

// ------------------------------------------------------------------------------- database pages

export type DbPageInput = {
  countries: string[];
  country: string | undefined;
  counts?: { total: number; free: number; selfPremium: number; paidPremium: number; signups: Points; premium: Points };
  subscriptions?: { totalCents: number; monthly: number; yearly: number; perMonth: Points };
};

const overviewTitle = (country?: string) => `Overview — ${country && country !== 'All' ? country : 'All Countries'}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function appUsersPage(input: DbPageInput): Page {
  const c = input.counts!;
  const freeAll = c.total > 0 ? round2((c.free / c.total) * 100) : 0;
  const selfFree = c.free > 0 ? round2((c.selfPremium / c.free) * 100) : 0;
  const paidFree = c.free > 0 ? round2((c.paidPremium / c.free) * 100) : 0;
  const conversion = c.selfPremium + c.free > 0 ? round2((c.paidPremium / (c.selfPremium + c.free)) * 100) : 0;
  const empty = (p: Points) => (p.length ? chart('column', p) : chart('column', [], {}));
  return {
    title: 'App User Analytics',
    source: 'db',
    countries: input.countries,
    country: input.country ?? 'All',
    sections: [
      section(overviewTitle(input.country), undefined, kpis([
        { label: 'All Users', value: fmt.number(c.total) },
        { label: 'Free Users', value: fmt.number(c.free) },
        { label: 'Self Premium Users', value: fmt.number(c.selfPremium) },
        { label: 'Paid Premium Users', value: fmt.number(c.paidPremium) },
        { label: 'Free / All (%)', value: `${freeAll}%` },
        { label: 'Self Premium / Free (%)', value: `${selfFree}%` },
        { label: 'Paid Premium / Free (%)', value: `${paidFree}%` },
        { label: 'Conversion Rate (%)', value: `${conversion}%` },
      ])),
      section('Graphs', undefined, grid(2,
        card('No. of Users / Time (Monthly)', empty(c.signups)),
        card('Conversion Rate / Time (Monthly)', empty(c.premium)),
      )),
    ],
  };
}

export function subscriptionsPage(input: DbPageInput): Page {
  const s = input.subscriptions!;
  return {
    title: 'Subscription Analytics',
    source: 'db',
    countries: input.countries,
    country: input.country ?? 'All',
    sections: [
      section(overviewTitle(input.country), undefined, kpis([
        { label: 'Total Amount Collected', value: `€${s.totalCents}` },
        { label: 'Monthly Subscribers', value: fmt.number(s.monthly) },
        { label: 'Yearly Subscribers', value: fmt.number(s.yearly) },
      ])),
      section('Graphs', undefined, card('Amount Collected / Time (Monthly)', chart('column', s.perMonth, { height: 300 }))),
    ],
  };
}
