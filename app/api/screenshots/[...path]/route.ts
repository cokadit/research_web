import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, isValidSession } from '@/src/lib/auth';
import { screenshotRoot } from '@/src/lib/enrich/screenshot';

export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isValidSession((await cookies()).get(SESSION_COOKIE)?.value)) return new Response('unauthorised', { status: 401 });

  const parts = (await params).path;
  // Exactly <company uuid>/<desktop|mobile>.webp. Anything else, including "..", is refused.
  if (parts.length !== 2 || !/^[0-9a-f-]{36}$/i.test(parts[0]) || !/^(desktop|mobile)\.webp$/.test(parts[1])) {
    return new Response('not found', { status: 404 });
  }
  try {
    const file = await readFile(path.join(/*turbopackIgnore: true*/ screenshotRoot(), parts[0], parts[1]));
    return new Response(new Uint8Array(file), { headers: { 'content-type': 'image/webp', 'cache-control': 'private, max-age=3600' } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
