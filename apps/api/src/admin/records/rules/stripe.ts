import { randomBytes } from 'crypto';

/** Minimal Stripe REST client (form-encoded POST), so the admin needs no SDK. */
export class StripeError extends Error {}

function encode(params: Record<string, unknown>, prefix = ''): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') out.push(...encode(value as Record<string, unknown>, name));
    else out.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
  }
  return out;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Rails stubs Stripe in the test environment with random ids. */
export const stripeStubbed = () => !stripeConfigured() && process.env.NODE_ENV === 'test';
export const fakeStripeId = (kind: string) => `test_${kind}_${randomBytes(8).toString('hex')}`;

export async function stripePost<T = { id: string }>(path: string, params: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encode(params).join('&'),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new StripeError(body.error?.message ?? `Stripe request failed (${res.status})`);
  return body;
}
