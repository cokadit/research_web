import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'rw_session';
export const SESSION_DAYS = 30;

function secret(): string | null {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
}

function sign(payload: string, key: string): string {
  return createHmac('sha256', key).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Compares against DASHBOARD_PASSWORD in constant time. An unset password or secret locks the dashboard. */
export function passwordMatches(input: string): boolean {
  const expected = process.env.DASHBOARD_PASSWORD;
  const key = secret();
  if (!expected || !key) return false;
  // Hash both sides so the comparison does not leak the password length.
  return safeEqual(sign(input, key), sign(expected, key));
}

export function createSessionToken(now: number = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const expires = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expires}.${sign(expires, key)}`;
}

export function isValidSession(token: string | undefined | null, now: number = Date.now()): boolean {
  const key = secret();
  if (!key || !token) return false;
  const [expires, signature] = token.split('.');
  if (!expires || !signature || !/^\d+$/.test(expires)) return false;
  return safeEqual(signature, sign(expires, key)) && Number(expires) > now;
}
