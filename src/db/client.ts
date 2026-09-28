import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env';
import * as schema from './schema';

// Next.js dev reloads modules on every change. Keep one pool per process.
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };

export const pg = globalForDb.__pg ?? postgres(env().DATABASE_URL, { max: 10, onnotice: () => {} });
if (process.env.NODE_ENV !== 'production') globalForDb.__pg = pg;

export const db = drizzle(pg, { schema });
export type Db = typeof db;
export { schema };

export async function closeDb(): Promise<void> {
  await pg.end({ timeout: 5 });
}
