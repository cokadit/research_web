import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, isValidSession, passwordMatches } from '../src/lib/auth';

const saved = { ...process.env };
beforeEach(() => {
  process.env.SESSION_SECRET = 'x'.repeat(40);
  process.env.DASHBOARD_PASSWORD = 'correct horse';
});
afterEach(() => {
  process.env = { ...saved };
});

describe('dashboard auth', () => {
  it('accepts only the right password', () => {
    expect(passwordMatches('correct horse')).toBe(true);
    expect(passwordMatches('correct horse ')).toBe(false);
    expect(passwordMatches('')).toBe(false);
  });
  it('locks the dashboard when password or secret is missing', () => {
    process.env.DASHBOARD_PASSWORD = '';
    expect(passwordMatches('')).toBe(false);
    process.env.DASHBOARD_PASSWORD = 'correct horse';
    process.env.SESSION_SECRET = 'short';
    expect(passwordMatches('correct horse')).toBe(false);
    expect(createSessionToken()).toBeNull();
  });
  it('issues tokens that verify until they expire', () => {
    const token = createSessionToken(1_000)!;
    expect(isValidSession(token, 2_000)).toBe(true);
    expect(isValidSession(token, 1_000 + 31 * 24 * 60 * 60 * 1000)).toBe(false);
  });
  it('rejects forged and malformed tokens', () => {
    const token = createSessionToken(1_000)!;
    const [expires, signature] = token.split('.');
    expect(isValidSession(`${Number(expires) + 1}.${signature}`, 2_000)).toBe(false);
    expect(isValidSession('abc', 2_000)).toBe(false);
    expect(isValidSession(undefined, 2_000)).toBe(false);
    process.env.SESSION_SECRET = 'y'.repeat(40);
    expect(isValidSession(token, 2_000)).toBe(false);
  });
});
