import { env } from '../../config/env';
import { PAGESPEED_TIMEOUT_MS } from '../../config/limits';
import { logApiCall } from '../api-log';
import { parsePsiResponse, psiErrorSchema, type PsiResult, type PsiStrategy } from './pagespeed-parse';

export { parsePsiResponse, type PsiResult, type PsiStrategy };

// Verified 2026-09-28 against developers.google.com/speed/docs/insights/v5/get-started
const ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

export async function runPageSpeed(url: string, strategy: PsiStrategy): Promise<PsiResult> {
  const key = env().PAGESPEED_API_KEY;
  if (!key) throw new Error('PAGESPEED_API_KEY is not set');

  const query = new URLSearchParams({ url, strategy, category: 'performance', key });
  const started = Date.now();
  try {
    const res = await fetch(`${ENDPOINT}?${query}`, { signal: AbortSignal.timeout(PAGESPEED_TIMEOUT_MS) });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = psiErrorSchema.safeParse(json);
      throw new Error(`PageSpeed HTTP ${res.status}: ${err.success ? (err.data.error.message ?? err.data.error.status) : 'unknown error'}`);
    }
    const result = parsePsiResponse(json);
    await logApiCall({ api: 'pagespeed', sku: strategy, ok: true, latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The key travels in the query string. Keep it out of logs and the database.
    const safe = message.replaceAll(key, '***');
    await logApiCall({ api: 'pagespeed', sku: strategy, ok: false, latencyMs: Date.now() - started, error: safe });
    throw new Error(safe);
  }
}
