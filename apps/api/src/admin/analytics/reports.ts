import { addDays, DateRange, Granularity, longDate, periodLabel, today, weekStart } from './date-range';
import { Ga4Client, Ga4ConfigurationError, Ga4Error, Ga4PermissionError, Ga4Query } from './ga4-client';

/**
 * Port of Ga4::Analytics::* reports. Each part of a report runs through `safely`, so one failing
 * query only empties its own section; `failure()` reports an error only when nothing could load.
 */
export type Points = Array<[string, number]>;
export type Totals = Record<string, { events: number; users: number; perUser: number }>;
export type Step = { label: string; value: number };
type Json = Record<string, any>;

export const pct = (part: number, whole: number, digits = 1) => (whole ? round((part / whole) * 100, digits) : 0);
export const cappedPct = (part: number, whole: number) => Math.min(pct(part, whole), 100);
export const ratio = (part: number, whole: number, digits = 2) => (whole ? round(part / whole, digits) : 0);
export const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

export abstract class Ga4Report<T> {
  readonly errors: Error[] = [];
  private attempts = 0;
  private result?: Promise<T>;

  constructor(readonly range: DateRange, private readonly refresh = false) {}

  protected get useCache() {
    return !this.refresh;
  }

  data(): Promise<T> {
    this.result ??= (async () => {
      if (this.refresh) await Ga4Client.metadata(false);
      return this.build();
    })();
    return this.result;
  }

  async failure(): Promise<Error | null> {
    await this.data();
    const blocking = this.errors.find((e) => e instanceof Ga4ConfigurationError || e instanceof Ga4PermissionError);
    return blocking ?? (this.attempts > 0 && this.errors.length >= this.attempts ? this.errors[0] : null);
  }

  protected abstract build(): Promise<T>;

  protected async safely<R>(fallback: R, fn: () => Promise<R>): Promise<R> {
    this.attempts += 1;
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof Ga4Error)) throw e;
      this.errors.push(e);
      console.warn(`[GA4 analytics] ${this.constructor.name}: ${e.message}`);
      return fallback;
    }
  }

  protected query(window = this.range) {
    return new Ga4Query(window, this.useCache);
  }

  protected async eventTotals(events: string[], window = this.range): Promise<Totals> {
    const totals: Totals = Object.fromEntries(events.map((e) => [e, { events: 0, users: 0, perUser: 0 }]));
    await this.safely(null, async () => {
      for (const row of await this.query(window).events(events).dimensions('event_name').metrics('event_count', 'total_users', 'events_per_user').rows()) {
        totals[row.event_name] = { events: row.event_count, users: row.total_users, perUser: round(Number(row.events_per_user), 2) };
      }
      return null;
    });
    return totals;
  }

  protected usersFor(events: string[], window = this.range): Promise<number> {
    return this.safely(0, async () => Number((await this.query(window).events(events).metrics('total_users').rows())[0]?.total_users ?? 0));
  }

  /** { event: [[period label, value], ...] }, zero-filled. */
  protected async series(events: string[], opts: { metric?: string; granularity?: Granularity; window?: DateRange } = {}): Promise<Record<string, Points>> {
    const metric = opts.metric ?? 'event_count';
    const window = opts.window ?? this.range;
    const g = opts.granularity ?? this.range.granularity;
    const periods = window.periods(g);
    const values: Record<string, Map<string, number>> = Object.fromEntries(events.map((e) => [e, new Map(periods.map((p) => [p, 0]))]));
    await this.safely(null, async () => {
      for (const row of await this.query(window).events(events).dimensions('event_name', g).metrics(metric).rows()) {
        const bucket = values[row.event_name];
        if (bucket?.has(row[g])) bucket.set(row[g], row[metric]);
      }
      return null;
    });
    return Object.fromEntries(Object.entries(values).map(([e, m]) => [e, [...m].map(([k, v]) => [periodLabel(k, g), v] as [string, number])]));
  }

  protected async usersSeries(events: string[], opts: { granularity?: Granularity; window?: DateRange } = {}): Promise<Points> {
    const window = opts.window ?? this.range;
    const g = opts.granularity ?? this.range.granularity;
    const values = new Map(window.periods(g).map((p) => [p, 0]));
    await this.safely(null, async () => {
      for (const row of await this.query(window).events(events).dimensions(g).metrics('total_users').rows()) {
        if (values.has(row[g])) values.set(row[g], row.total_users);
      }
      return null;
    });
    return [...values].map(([k, v]) => [periodLabel(k, g), v]);
  }

  protected audience(window = this.range) {
    const empty = { active_users: 0, new_users: 0, sessions: 0, engagement_seconds: 0 };
    return this.safely(empty, async () => ((await this.query(window).metrics('active_users', 'new_users', 'sessions', 'engagement_seconds').rows())[0] as typeof empty) ?? empty);
  }

  protected async activity() {
    const rows = await this.safely([] as Json[], () => this.query().dimensions('date').metrics('dau', 'wau', 'mau').rows());
    const byDate = new Map(rows.map((r) => [r.date, r]));
    const trend: Record<string, Points> = { DAU: [], WAU: [], MAU: [] };
    for (const key of this.range.periods('date')) {
      const label = periodLabel(key, 'date');
      const row = byDate.get(key) ?? {};
      trend.DAU.push([label, Number(row.dau ?? 0)]);
      trend.WAU.push([label, Number(row.wau ?? 0)]);
      trend.MAU.push([label, Number(row.mau ?? 0)]);
    }
    const last = byDate.get(this.range.end.replace(/-/g, '')) ?? {};
    const dau = Number(last.dau ?? 0);
    const mau = Number(last.mau ?? 0);
    return {
      trend,
      dau,
      wau: Number(last.wau ?? 0),
      mau,
      avgDau: rows.length ? Math.round(rows.reduce((s, r) => s + Number(r.dau ?? 0), 0) / this.range.days) : 0,
      stickiness: pct(dau, mau),
    };
  }

  protected audienceBy(dimension: string, limit = 10): Promise<Array<{ label: string; users: number }>> {
    return this.safely([], async () =>
      (await this.query().dimensions(dimension).metrics('active_users').present(dimension).rows())
        .sort((a, b) => b.active_users - a.active_users)
        .slice(0, limit)
        .map((r) => ({ label: r[dimension], users: r.active_users })),
    );
  }

  /** GA4 closed funnel over events; unique users per step when that report is unavailable. */
  protected async funnel(steps: Array<[string, string[]]>, window = this.range): Promise<{ exact: boolean; steps: Step[] }> {
    const exact = await this.safely(null as Step[] | null, () => this.funnelReport(steps, window));
    if (exact) return { exact: true, steps: exact };
    const out: Step[] = [];
    for (const [label, events] of steps) out.push({ label, value: await this.usersFor(events, window) });
    return { exact: false, steps: out };
  }

  private async funnelReport(steps: Array<[string, string[]]>, window: DateRange): Promise<Step[]> {
    const filter = (events: string[]) => {
      const list = events.map((eventName) => ({ funnelEventFilter: { eventName } }));
      return list.length === 1 ? list[0] : { orGroup: { expressions: list } };
    };
    const body = { dateRanges: [window.toApi()], funnel: { isOpenFunnel: false, steps: steps.map(([name, events]) => ({ name, filterExpression: filter(events) })) } };
    const table = (await Ga4Client.runFunnelReport(body, this.useCache)).funnelTable ?? {};
    const usersIndex = Math.max(0, (table.metricHeaders ?? []).findIndex((h: Json) => h.name === 'activeUsers'));
    const values = steps.map(() => 0);
    for (const row of table.rows ?? []) {
      const position = Number(/^(\d+)\./.exec(String(row.dimensionValues?.[0]?.value ?? ''))?.[1] ?? 0) - 1;
      if (position >= 0 && position < steps.length) values[position] = Number(row.metricValues?.[usersIndex]?.value ?? 0);
    }
    return steps.map(([label], i) => ({ label, value: values[i] }));
  }

  /** Weekly cohorts by first app open: share active again 1..3 weeks later. */
  protected async weeklyCohorts() {
    const COHORTS = 6;
    const WEEKS = 3;
    const lastStart = weekStart(this.range.end);
    const starts = Array.from({ length: COHORTS }, (_, i) => addDays(lastStart, -7 * i)).reverse();
    const now = today();
    const body = {
      dimensions: [{ name: 'cohort' }, { name: 'cohortNthWeek' }],
      metrics: [{ name: 'cohortActiveUsers' }, { name: 'cohortTotalUsers' }],
      cohortSpec: {
        cohorts: starts.map((s) => ({ name: s, dimension: 'firstSessionDate', dateRange: { startDate: s, endDate: addDays(s, 6) < now ? addDays(s, 6) : now } })),
        cohortsRange: { granularity: 'WEEKLY', startOffset: 0, endOffset: WEEKS },
      },
    };
    const rows = await this.safely([] as Json[], () => Ga4Client.runReport(body, this.useCache));
    const active = new Map<string, number>();
    const size = new Map<string, number>();
    for (const row of rows) {
      const cohort = row.dimensionValues?.[0]?.value;
      const week = Number(row.dimensionValues?.[1]?.value ?? 0);
      active.set(`${cohort}|${week}`, Number(row.metricValues?.[0]?.value ?? 0));
      size.set(cohort, Math.max(size.get(cohort) ?? 0, Number(row.metricValues?.[1]?.value ?? 0)));
    }
    return starts.map((s) => ({
      label: `Wk of ${longDate(s)}`,
      size: size.get(s) ?? 0,
      retention: Array.from({ length: WEEKS }, (_, i) => (addDays(s, 7 * (i + 1)) > now ? null : pct(active.get(`${s}|${i + 1}`) ?? 0, size.get(s) ?? 0))),
    }));
  }

  /** Per-value counts for an event parameter, or null when GA4 does not expose it. */
  protected async breakdown(events: string[], param: string, limit = 15): Promise<Array<Json> | null> {
    if (!(await Ga4Client.customDimension(param))) return null;
    return this.safely(null as Json[] | null, async () => {
      const grouped = new Map<string, Json>();
      for (const row of await this.query().events(events).dimensions('event_name', param).metrics('event_count', 'total_users').present(param).rows()) {
        let entry = grouped.get(row[param]);
        if (!entry) {
          entry = { value: row[param], ...Object.fromEntries(events.map((e) => [e, { events: 0, users: 0 }])) };
          grouped.set(row[param], entry);
        }
        entry[row.event_name] = { events: row.event_count, users: row.total_users };
      }
      const total = (e: Json) => events.reduce((s, ev) => s + e[ev].events, 0);
      return [...grouped.values()].sort((a, b) => total(b) - total(a)).slice(0, limit);
    });
  }

  protected async parameterAverage(events: string[], param: string): Promise<number | null> {
    if (!(await Ga4Client.customMetric(param))) return null;
    return this.safely(null as number | null, async () => {
      const row = (await this.query().events(events).metrics('event_count', param).rows())[0];
      return row && row.event_count > 0 ? round(Number(row[param]) / row.event_count, 1) : null;
    });
  }
}

// --------------------------------------------------------------------------------- reports

export class EngagementReport extends Ga4Report<Json> {
  static FEATURES: Record<string, string[]> = {
    Lessons: ['lesson_started', 'lesson_resumed'],
    'Puzzle Mix': ['puzzle_mix_started', 'puzzle_mix_resumed'],
    'Weekly Challenges': ['weekly_challenge_started', 'weekly_challenge_resumed'],
    Competitions: ['competition_started', 'competition_resumed'],
    Shadows: ['shadow_activated'],
    Shields: ['shield_activated'],
  };
  static TREND: Record<string, string> = { Lessons: 'lesson_started', 'Puzzle Mix': 'puzzle_mix_started', 'Weekly Challenges': 'weekly_challenge_started', Competitions: 'competition_started' };

  protected async build() {
    const current = await this.audience();
    const previous = await this.audience(this.range.previous());
    const active = Number(current.active_users);
    const adoption = [];
    for (const [feature, events] of Object.entries(EngagementReport.FEATURES)) {
      const users = await this.usersFor(events);
      adoption.push({ feature, users, adoption: cappedPct(users, active) });
    }
    adoption.sort((a, b) => b.users - a.users);
    const trendData = await this.series(Object.values(EngagementReport.TREND), { metric: 'total_users' });
    const nvr = await this.audienceBy('new_vs_returning');
    return {
      audience: current,
      activeChange: previous.active_users ? pct(active - previous.active_users, previous.active_users) : null,
      engagementPerUser: active ? Math.round(Number(current.engagement_seconds) / active) : 0,
      sessionsPerUser: ratio(Number(current.sessions), active, 1),
      activity: await this.activity(),
      adoption,
      featureTrend: Object.fromEntries(Object.entries(EngagementReport.TREND).map(([label, event]) => [label, trendData[event]])),
      newVsReturning: nvr.map((r) => [r.label.charAt(0).toUpperCase() + r.label.slice(1).toLowerCase(), r.users] as [string, number]),
      platforms: await this.audienceBy('platform'),
      devices: await this.audienceBy('device'),
      countries: await this.audienceBy('country'),
    };
  }
}

export class RetentionReport extends Ga4Report<Json> {
  protected async build() {
    const totals = await this.eventTotals(['sign_up', 'login', 'logout', 'weekly_returns']);
    const current = await this.audience();
    const previous = await this.audience(this.range.previous());
    const weeks = this.range.atLeast(56).aligned('week');
    return {
      totals,
      logoutRate: pct(totals.logout.events, totals.login.events),
      activity: await this.activity(),
      activeUsers: Number(current.active_users),
      activeChange: previous.active_users ? pct(current.active_users - previous.active_users, previous.active_users) : null,
      signups: {
        daily: (await this.series(['sign_up'], { granularity: 'date' })).sign_up,
        weekly: (await this.series(['sign_up'], { granularity: 'week', window: weeks })).sign_up,
        monthly: (await this.series(['sign_up'], { granularity: 'month', window: this.range.atLeast(180).aligned('month') })).sign_up,
      },
      authTrend: await this.series(['login', 'logout']),
      loginUsers: await this.usersSeries(['login']),
      weeklyReturns: await this.usersSeries(['weekly_returns'], { granularity: 'week', window: weeks }),
      cohorts: await this.weeklyCohorts(),
      activation: await this.funnel([
        ['Signed up', ['sign_up']],
        ['Started a lesson', ['lesson_started']],
        ['Completed a lesson', ['lesson_completed']],
      ]),
    };
  }
}

export class LessonReport extends Ga4Report<Json> {
  static EVENTS = [
    'lesson_started', 'lesson_resumed', 'micro_lesson_started', 'micro_lesson_summary_viewed', 'exercise_started',
    'exercise_completed', 'micro_lesson_completed', 'lesson_summary_viewed', 'lesson_completed', 'lesson_exited',
  ];
  static FUNNEL: Array<[string, string[]]> = [
    ['Started or resumed a lesson', ['lesson_started', 'lesson_resumed']],
    ['Started a micro-lesson', ['micro_lesson_started']],
    ['Viewed a micro-lesson summary', ['micro_lesson_summary_viewed']],
    ['Started an exercise', ['exercise_started']],
    ['Completed an exercise', ['exercise_completed']],
    ['Completed a micro-lesson', ['micro_lesson_completed']],
    ['Viewed the lesson summary', ['lesson_summary_viewed']],
    ['Completed the lesson', ['lesson_completed']],
  ];
  static STAGES: Array<[string, string, string, string]> = [
    ['Lessons', 'lesson_started', 'lesson_completed', 'Completed'],
    ['Micro-lessons', 'micro_lesson_started', 'micro_lesson_completed', 'Completed'],
    ['Micro-lesson summaries', 'micro_lesson_started', 'micro_lesson_summary_viewed', 'Summary viewed'],
    ['Exercises', 'exercise_started', 'exercise_completed', 'Completed'],
    ['Lesson summaries', 'lesson_started', 'lesson_summary_viewed', 'Summary viewed'],
  ];

  protected async build() {
    const t = await this.eventTotals(LessonReport.EVENTS);
    const sessions = t.lesson_started.events + t.lesson_resumed.events;
    const learners = await this.usersFor(['lesson_started', 'lesson_resumed']);
    return {
      totals: t,
      learners,
      completionRate: cappedPct(t.lesson_completed.events, t.lesson_started.events),
      resumeShare: pct(t.lesson_resumed.events, sessions),
      exitRate: cappedPct(t.lesson_exited.events, sessions),
      exitsPerLearner: ratio(t.lesson_exited.events, learners, 1),
      stages: LessonReport.STAGES.map(([stage, started, finished, finishedLabel]) => ({
        stage,
        finishedLabel,
        started: t[started].events,
        finished: t[finished].events,
        startedUsers: t[started].users,
        finishedUsers: t[finished].users,
        rate: cappedPct(t[finished].events, t[started].events),
      })),
      funnel: await this.funnel(LessonReport.FUNNEL),
      trend: await this.series(['lesson_started', 'lesson_resumed', 'lesson_completed', 'lesson_exited']),
      stepTrend: await this.series(['micro_lesson_started', 'micro_lesson_completed', 'exercise_started', 'exercise_completed']),
      exitSteps: await this.breakdown(['lesson_exited'], 'exit_step'),
      lessons: await this.breakdown(['lesson_started', 'lesson_completed'], 'lesson_name'),
      exercises: await this.breakdown(['exercise_started', 'exercise_completed'], 'exercise_name'),
    };
  }
}

export class ShadowShieldReport extends Ga4Report<Json> {
  static EVENTS = ['shadow_unlocked', 'shadow_activated', 'shield_unlocked', 'shield_activated'];
  static KINDS: Record<string, { label: string; singular: string; name: string }> = {
    shadow: { label: 'Shadows', singular: 'Shadow', name: 'shadow_name' },
    shield: { label: 'Shields', singular: 'Shield', name: 'shield_name' },
  };

  protected async build() {
    const totals = await this.eventTotals(ShadowShieldReport.EVENTS);
    const active = Number((await this.audience()).active_users);
    const kinds: Json = {};
    for (const [kind, c] of Object.entries(ShadowShieldReport.KINDS)) {
      const unlocked = totals[`${kind}_unlocked`];
      const activated = totals[`${kind}_activated`];
      kinds[kind] = {
        ...c,
        unlocked,
        activated,
        unlockRate: cappedPct(unlocked.users, active),
        activationRate: cappedPct(activated.users, active),
        activationsPerUnlock: ratio(activated.events, unlocked.events, 1),
        activationsPerUser: activated.perUser,
        items: await this.breakdown([`${kind}_unlocked`, `${kind}_activated`], c.name),
      };
    }
    return {
      totals,
      activeUsers: active,
      kinds,
      trend: await this.series(ShadowShieldReport.EVENTS),
      usersTrend: await this.series(ShadowShieldReport.EVENTS, { metric: 'total_users' }),
    };
  }
}

/** Features tracked as <prefix>_started / _resumed / _completed / _exited. */
export class ProgressFeatureReport extends Ga4Report<Json> {
  constructor(range: DateRange, refresh: boolean, readonly prefix: string, readonly breakdowns: Array<[string, string, string]>) {
    super(range, refresh);
  }

  private ev(step: string) {
    return `${this.prefix}_${step}`;
  }

  protected async build() {
    const events = ['started', 'resumed', 'completed', 'exited'].map((s) => this.ev(s));
    const totals = await this.eventTotals(events);
    const started = totals[this.ev('started')].events;
    const resumed = totals[this.ev('resumed')].events;
    const completed = totals[this.ev('completed')].events;
    const exited = totals[this.ev('exited')].events;
    const players = await this.usersFor([this.ev('started'), this.ev('resumed')]);
    const weekly = this.range.atLeast(56).aligned('week');
    const details = [];
    for (const [title, param, column] of this.breakdowns) {
      const rows = await this.breakdown(events, param);
      if (rows) details.push({ title, column, rows });
    }
    return {
      totals,
      players,
      completionRate: cappedPct(completed, started),
      exitRate: cappedPct(exited, started + resumed),
      resumeShare: pct(resumed, started + resumed),
      completionsPerPlayer: ratio(completed, players, 1),
      outcomes: [['Completed', completed], ['Exited', exited]] as Points,
      funnel: await this.funnel([['Started or resumed', [this.ev('started'), this.ev('resumed')]], ['Completed', [this.ev('completed')]]]),
      trend: await this.series(events),
      weekly: {
        Players: await this.usersSeries([this.ev('started'), this.ev('resumed')], { granularity: 'week', window: weekly }),
        Completed: await this.usersSeries([this.ev('completed')], { granularity: 'week', window: weekly }),
        Exited: await this.usersSeries([this.ev('exited')], { granularity: 'week', window: weekly }),
      },
      progressAtExit: await this.parameterAverage([this.ev('exited')], 'current_progress'),
      progressAtResume: await this.parameterAverage([this.ev('resumed')], 'current_progress'),
      breakdowns: details,
    };
  }
}
