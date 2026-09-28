import { z } from 'zod';
import { env } from '../../config/env';
import { callsThisMonth, logApiCall } from '../api-log';

// Verified 2026-09-28 against developers.google.com/maps/documentation/places/web-service/text-search
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

/**
 * places.id is on the free "Essentials (IDs Only)" SKU. places.websiteUri moves the
 * request to "Text Search Enterprise" (1,000 free requests per month, then billed).
 * One request returns up to 20 places, which is far cheaper than Place Details per place.
 *
 * Names and addresses are deliberately not requested: the Maps Platform terms
 * (3.2.3a) forbid saving them, and the crawl gives us the name anyway.
 */
export const PLACES_FIELD_MASK = 'places.id,places.websiteUri';
export const PLACES_SKU = 'text_search_enterprise';
export const PLACES_PAGE_SIZE = 20;

const responseSchema = z.object({
  places: z.array(z.object({ id: z.string(), websiteUri: z.string().optional() })).optional(),
});

export interface PlaceCandidate {
  placeId: string;
  /** Used once to reach the site, then dropped. Never written to the database. */
  transientWebsiteUri: string | null;
}

export class PlacesCapReached extends Error {
  constructor(
    public readonly used: number,
    public readonly cap: number,
  ) {
    super(`Places monthly cap reached: ${used} of ${cap} calls used this month`);
    this.name = 'PlacesCapReached';
  }
}

export class PlacesDisabled extends Error {
  constructor(reason: string) {
    super(`Places discovery is off: ${reason}`);
    this.name = 'PlacesDisabled';
  }
}

export async function placesBudget(): Promise<{ used: number; cap: number; left: number }> {
  const cap = env().PLACES_MONTHLY_CAP;
  const used = await callsThisMonth('places');
  return { used, cap, left: Math.max(0, cap - used) };
}

export async function searchPlaces(textQuery: string, opts: { regionCode?: string; languageCode?: string } = {}): Promise<PlaceCandidate[]> {
  const { PLACES_ENABLED, GOOGLE_PLACES_API_KEY: key } = env();
  if (!PLACES_ENABLED) throw new PlacesDisabled('PLACES_ENABLED is false');
  if (!key) throw new PlacesDisabled('GOOGLE_PLACES_API_KEY is not set');

  const budget = await placesBudget();
  if (budget.left <= 0) throw new PlacesCapReached(budget.used, budget.cap);

  const started = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key, 'x-goog-fieldmask': PLACES_FIELD_MASK },
      body: JSON.stringify({ textQuery, pageSize: PLACES_PAGE_SIZE, ...opts }),
      signal: AbortSignal.timeout(20_000),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Places HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 300)}`);
    const parsed = responseSchema.parse(json);
    await logApiCall({ api: 'places', sku: PLACES_SKU, ok: true, latencyMs: Date.now() - started });
    return (parsed.places ?? []).map((p) => ({ placeId: p.id, transientWebsiteUri: p.websiteUri ?? null }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logApiCall({ api: 'places', sku: PLACES_SKU, ok: false, latencyMs: Date.now() - started, error: message });
    throw err;
  }
}
