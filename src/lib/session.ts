import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, isValidSession } from './auth';

/** Server Actions are reachable by POST, so each one checks the session itself. */
export async function requireSession(): Promise<void> {
  const store = await cookies();
  if (!isValidSession(store.get(SESSION_COOKIE)?.value)) redirect('/login');
}
