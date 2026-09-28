import wappalyzer from 'simple-wappalyzer';

export interface DetectedTech {
  name: string;
  categories: string[];
}

const PLATFORM_CATEGORIES = ['CMS', 'Ecommerce', 'Page builders', 'Static site generator', 'Blogs', 'Landing page builders'];
// When several match, the hosted builder or shop system is the platform the owner actually works in.
const PLATFORM_PRIORITY = ['Shopify', 'Wix', 'Squarespace', 'Webflow', 'WooCommerce', 'WordPress', 'Elementor', 'Weebly', 'GoDaddy Website Builder', 'Blogger'];

export function pickPlatform(tech: DetectedTech[]): string | null {
  for (const name of PLATFORM_PRIORITY) if (tech.some((t) => t.name === name)) return name;
  return tech.find((t) => t.categories.some((c) => PLATFORM_CATEGORIES.includes(c)))?.name ?? null;
}

export async function detectTech(input: { url: string; headers: Record<string, string>; html: string }): Promise<{ tech: DetectedTech[]; platform: string | null }> {
  const found = await wappalyzer(input);
  const tech = found
    .filter((t) => (t.confidence ?? 100) >= 50)
    .map((t) => ({ name: t.name, categories: (t.categories ?? []).map((c) => c.name) }));
  return { tech, platform: pickPlatform(tech) };
}
