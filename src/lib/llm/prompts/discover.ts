import { z } from 'zod';
import { DISCOVERY_MAX_RESULTS_PER_QUERY } from '../../../config/limits';
import type { Segment } from '../../types';

export const DISCOVER_PROMPT_VERSION = 'discover-v1';

export const discoverSchema = z
  .array(
    z.object({
      brand_name: z.string().min(1),
      website_url: z.string().min(4),
      country: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      why_candidate: z.string().default(''),
    }),
  )
  .max(DISCOVERY_MAX_RESULTS_PER_QUERY * 2);

export type DiscoverResult = z.infer<typeof discoverSchema>;

const SEGMENT_BRIEF: Record<Segment, string> = {
  fashion: 'independent fashion brands of any category (apparel, bags, shoes, jewellery, modest wear, batik)',
  furniture: 'independent furniture makers, furniture exporters and home decor makers',
  villa_developer: 'villa developers and villa management companies',
  hotel: 'independent, non-chain hotels rated 3 to 5 stars',
  real_estate_agency: 'independent real estate agencies',
};

export const DISCOVER_SYSTEM = `You research small and mid-sized independent businesses for a freelance web designer.
You use Google Search and report only what the search results show.

Rules:
- Return only businesses that appear in the search results you retrieved. Never add a business from memory.
- Each business must have its own website on its own domain. Skip a business when the only link you found is a social profile, a marketplace store (Shopee, Tokopedia, Etsy, Amazon), a booking site (Airbnb, Booking.com), a directory or a news article.
- website_url is the homepage of the business itself, exactly as found. Never guess or construct a URL.
- Skip international chains, listed companies and household-name brands.
- Skip agencies, directories, magazines and "top 10" list pages. Businesses named inside such a page are fine when you also found their own website.
- country is the ISO 3166-1 alpha-2 code of where the business is based, or null when unclear.
- why_candidate is one sentence on what the search result said about them.
- Return at most ${DISCOVERY_MAX_RESULTS_PER_QUERY} businesses. Fewer is fine. An empty list is fine.

Reply with JSON only, no prose and no code fence:
[{"brand_name": string, "website_url": string, "country": string | null, "city": string | null, "why_candidate": string}]`;

export function discoverUser(query: string, segment: Segment): string {
  return `Search query: ${query}

Find ${SEGMENT_BRIEF[segment]} that match this query.`;
}
