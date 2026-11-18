import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';

/**
 * Google Authenticator codes, compatible with the Rails ROTP setup:
 * base32 secret in `admin_users.google_secret`, 30 s step, 6 digits,
 * and one previous step accepted (`drift_behind: 30`).
 */
const totp = authenticator.clone({ window: [1, 0] });

export function verifyTotp(code: string, secret: string | null | undefined): boolean {
  if (!secret || !/^\d{6}$/.test(code ?? '')) return false;
  try {
    return totp.check(code, secret);
  } catch {
    return false;
  }
}

/** Same check at a given time (ms since epoch); used by tests. */
export function verifyTotpAt(code: string, secret: string, epochMs: number): boolean {
  return authenticator.clone({ window: [1, 0], epoch: epochMs }).check(code, secret);
}

export function generateTotpSecret(): string {
  // ROTP::Base32.random gives 32 base32 characters (160 bits); keep the same length.
  return authenticator.generateSecret(20);
}

export function provisioningUri(issuer: string, email: string, secret: string): string {
  return authenticator.keyuri(email, issuer, secret);
}

export function qrCodeSvg(uri: string): Promise<string> {
  return QRCode.toString(uri, { type: 'svg', margin: 1 });
}

/** Test helper: the current code for a secret. */
export function currentTotp(secret: string): string {
  return totp.generate(secret);
}
