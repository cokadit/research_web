import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { appState } from '../db/schema';

export async function getState<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appState).where(eq(appState.key, key));
  return row ? (row.value as T) : fallback;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await db
    .insert(appState)
    .values({ key, value })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
}

export const rulesVersion = () => getState<number>('rules_version', 0);
