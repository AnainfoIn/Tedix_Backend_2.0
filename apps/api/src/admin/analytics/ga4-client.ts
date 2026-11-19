import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import * as jwt from 'jsonwebtoken';

/**
 * Port of Ga4::Client: the GA4 Data API (runReport, runFunnelReport, metadata) with a
 * 30-minute cache. Credentials: GA4_PROPERTY_ID plus the service account key, either as
 * GA4_SERVICE_ACCOUNT_JSON (the JSON, or the JSON in base64) or a file at GA4_SERVICE_ACCOUNT_FILE.
 */
export class Ga4Error extends Error {}
export class Ga4ConfigurationError extends Ga4Error {}
export class Ga4PermissionError extends Ga4Error {
  constructor(readonly serviceAccount: string | null, readonly propertyId: string | null, details: string) {
    super(`GA4 API error (403): ${details}`);
  }
}

const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const BASE_URL = 'https://analyticsdata.googleapis.com';
const PAGE_SIZE = 100_000;
const MAX_ROWS = 1_000_000;
const CACHE_TTL = 30 * 60_000;
const METADATA_TTL = 60 * 60_000;

type Key = { client_email: string; private_key: string; token_uri?: string };
type Json = Record<string, any>;

const cache = new Map<string, { at: number; value: unknown }>();
let token: { value: string; expires: number } | null = null;
let metadata: { at: number; dimensions: Set<string>; metrics: Set<string> } | null = null;

export const Ga4Client = {
  propertyId(): string | null {
    return process.env.GA4_PROPERTY_ID?.trim() || null;
  },

  key(): Key | null {
    try {
      const raw = process.env.GA4_SERVICE_ACCOUNT_JSON?.trim();
      if (raw) return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
      const file = process.env.GA4_SERVICE_ACCOUNT_FILE?.trim();
      if (file) return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
    return null;
  },

  configured(): boolean {
    return !!this.propertyId() && !!this.key();
  },

  serviceAccountEmail(): string | null {
    return this.key()?.client_email ?? null;
  },

  async runReport(body: Json, useCache = true): Promise<Json[]> {
    ensureConfigured();
    return cached(['report', body], useCache, () => fetchAllRows(body));
  },

  async runFunnelReport(body: Json, useCache = true): Promise<Json> {
    ensureConfigured();
    return cached(['funnel', body], useCache, () => request('POST', `/v1alpha/properties/${this.propertyId()}:runFunnelReport`, body));
  },

  /** Event parameters registered as custom dimensions / metrics; null when unavailable. */
  async metadata(useCache = true) {
    if (!this.configured()) return null;
    if (useCache && metadata && Date.now() - metadata.at < METADATA_TTL) return metadata;
    try {
      const body = await request('GET', `/v1beta/properties/${this.propertyId()}/metadata`);
      metadata = {
        at: Date.now(),
        dimensions: new Set((body.dimensions ?? []).map((f: Json) => f.apiName)),
        metrics: new Set((body.metrics ?? []).map((f: Json) => f.apiName)),
      };
      return metadata;
    } catch {
      return null;
    }
  },

  async customDimension(param: string) {
    return (await this.metadata())?.dimensions.has(`customEvent:${param}`) ?? false;
  },

  async customMetric(param: string) {
    return (await this.metadata())?.metrics.has(`customEvent:${param}`) ?? false;
  },
};

function ensureConfigured() {
  if (!Ga4Client.configured()) {
    throw new Ga4ConfigurationError('Google Analytics is not configured. Set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON on the server.');
  }
}

async function cached<T>(key: [string, Json], useCache: boolean, load: () => Promise<T>): Promise<T> {
  const id = `${Ga4Client.propertyId()}:${key[0]}:${createHash('sha256').update(JSON.stringify(key[1])).digest('hex')}`;
  const hit = cache.get(id);
  if (useCache && hit && Date.now() - hit.at < CACHE_TTL) return hit.value as T;
  const value = await load();
  cache.set(id, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

async function fetchAllRows(body: Json): Promise<Json[]> {
  const rows: Json[] = [];
  let offset = 0;
  for (;;) {
    const page = await request('POST', `/v1beta/properties/${Ga4Client.propertyId()}:runReport`, { ...body, limit: PAGE_SIZE, offset });
    const batch: Json[] = page.rows ?? [];
    rows.push(...batch);
    offset += batch.length;
    if (!batch.length || offset >= Number(page.rowCount ?? 0) || offset >= MAX_ROWS) break;
  }
  return rows;
}

async function request(method: 'GET' | 'POST', path: string, body?: Json): Promise<Json> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    if (e instanceof Ga4Error) throw e;
    throw new Ga4Error(`GA4 API request failed: ${(e as Error).message}`);
  }
  const text = await response.text();
  let parsed: Json = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  if (response.ok) return parsed;
  const details = parsed.error?.message ?? text;
  if (response.status === 403) throw new Ga4PermissionError(Ga4Client.serviceAccountEmail(), Ga4Client.propertyId(), details);
  throw new Ga4Error(`GA4 API error (${response.status}): ${details}`);
}

async function accessToken(): Promise<string> {
  if (token && token.expires - Date.now() > 60_000) return token.value;
  const key = Ga4Client.key();
  if (!key) throw new Ga4ConfigurationError('Google Analytics is not configured. Set GA4_PROPERTY_ID and GA4_SERVICE_ACCOUNT_JSON on the server.');
  const now = Math.floor(Date.now() / 1000);
  const aud = key.token_uri ?? 'https://oauth2.googleapis.com/token';
  let assertion: string;
  try {
    assertion = jwt.sign({ iss: key.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }, key.private_key, { algorithm: 'RS256' });
  } catch (e) {
    throw new Ga4Error(`GA4 authentication failed: ${(e as Error).message}`);
  }
  const response = await fetch(aud, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(30_000),
  }).catch((e: Error) => {
    throw new Ga4Error(`GA4 authentication failed: ${e.message}`);
  });
  const body = (await response.json().catch(() => ({}))) as Json;
  if (!response.ok || !body.access_token) throw new Ga4Error(`GA4 authentication failed: ${body.error_description ?? body.error ?? response.status}`);
  token = { value: body.access_token, expires: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return token.value;
}

/** Port of Ga4::Query: event/dimension/metric report rows as plain objects. */
const DIMENSIONS: Record<string, string> = {
  event_name: 'eventName', date: 'date', week: 'isoYearIsoWeek', month: 'yearMonth', platform: 'platform',
  device: 'deviceCategory', country: 'country', new_vs_returning: 'newVsReturning',
};
const METRICS: Record<string, string> = {
  event_count: 'eventCount', total_users: 'totalUsers', active_users: 'activeUsers', new_users: 'newUsers',
  events_per_user: 'eventCountPerUser', sessions: 'sessions', engagement_seconds: 'userEngagementDuration',
  dau: 'active1DayUsers', wau: 'active7DayUsers', mau: 'active28DayUsers',
};
const NOT_SET = ['(not set)', ''];
const dimensionName = (k: string) => DIMENSIONS[k] ?? `customEvent:${k}`;
const metricName = (k: string) => METRICS[k] ?? `customEvent:${k}`;

export class Ga4Query {
  private dims: string[] = [];
  private mets: string[] = [];
  private filters: Json[] = [];
  private required: string[] = [];

  constructor(private readonly range: { toApi(): Json }, private readonly useCache = true) {}

  dimensions(...keys: string[]) {
    this.dims.push(...keys);
    return this;
  }
  metrics(...keys: string[]) {
    this.mets.push(...keys);
    return this;
  }
  events(names: string[]) {
    return this.where('event_name', names);
  }
  where(key: string, values: string[]) {
    this.filters.push({ filter: { fieldName: dimensionName(key), inListFilter: { values: values.map(String) } } });
    return this;
  }
  present(...keys: string[]) {
    this.required.push(...keys);
    return this;
  }
  body(): Json {
    const body: Json = {
      dateRanges: [this.range.toApi()],
      dimensions: this.dims.map((k) => ({ name: dimensionName(k) })),
      metrics: this.mets.map((k) => ({ name: metricName(k) })),
      keepEmptyRows: false,
    };
    if (this.filters.length) body.dimensionFilter = this.filters.length === 1 ? this.filters[0] : { andGroup: { expressions: this.filters } };
    return body;
  }
  async rows(): Promise<Json[]> {
    const raw = await Ga4Client.runReport(this.body(), this.useCache);
    return raw
      .map((r) => {
        const row: Json = {};
        this.dims.forEach((k, i) => (row[k] = String(r.dimensionValues?.[i]?.value ?? '')));
        this.mets.forEach((k, i) => {
          const text = String(r.metricValues?.[i]?.value ?? '0');
          row[k] = text.includes('.') ? parseFloat(text) : parseInt(text, 10) || 0;
        });
        return row;
      })
      .filter((row) => !this.required.some((k) => NOT_SET.includes(row[k])));
  }
}
