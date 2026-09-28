'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, passwordMatches } from '@/src/lib/auth';

export interface LoginState {
  error: string | null;
}

// Slows down guessing. Resets when the process restarts.
const failures = { count: 0, lockedUntil: 0 };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  if (Date.now() < failures.lockedUntil) return { error: 'Too many attempts. Wait a minute and try again.' };

  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '');
  const token = passwordMatches(password) ? createSessionToken() : null;
  if (!token) {
    failures.count++;
    if (failures.count >= 5) {
      failures.count = 0;
      failures.lockedUntil = Date.now() + 60_000;
    }
    const unset = !process.env.DASHBOARD_PASSWORD || (process.env.SESSION_SECRET ?? '').length < 32;
    return { error: unset ? 'DASHBOARD_PASSWORD or SESSION_SECRET is not set in .env. Run `npm run check:env`.' : 'Wrong password.' };
  }

  failures.count = 0;
  const store = await cookies();
  // No `secure` flag: the dashboard is reached over Tailscale, often by plain http on a tailnet address.
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 24 * 60 * 60 });
  // Only local paths, so the login form cannot be used to bounce to another site.
  redirect(/^\/(?!\/)/.test(next) ? next : '/leads');
}

export async function logout(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}
