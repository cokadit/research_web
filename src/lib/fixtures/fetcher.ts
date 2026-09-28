import { placeholderWebp } from '../enrich/screenshot';
import { collapse, type FetchedPage, type HomepageResult, type SiteFetcher, type SiteSession } from '../enrich/site';
import { fixtureFor, fixtureHomepageHtml, type FixtureSite } from './sites';

function page(site: FixtureSite, path: string): FetchedPage {
  const html = fixtureHomepageHtml(site);
  const base = `https://${site.domain}`;
  return {
    url: `${base}${path}`,
    title: site.name,
    html,
    text: collapse(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')),
    links: [`${base}/about`, `${base}/contact`],
  };
}

class FixtureSession implements SiteSession {
  constructor(
    private readonly domain: string,
    private readonly site: FixtureSite | null,
  ) {}

  async homepage(): Promise<HomepageResult> {
    const empty = { httpStatus: null, finalUrl: null, headers: {}, page: null, screenshots: { desktop: null, mobile: null } };
    const site = this.site;
    if (!site) return { ...empty, outcome: 'dead', detail: `no fixture for ${this.domain} (mock mode never uses the network)` };
    if (site.outcome === 'dead') return { ...empty, httpStatus: 404, outcome: 'dead', detail: 'HTTP 404' };
    if (site.outcome === 'parked') return { ...empty, httpStatus: 200, finalUrl: `https://${site.domain}/`, outcome: 'parked', detail: 'page says "This domain is for sale"' };
    if (site.outcome === 'marketplace') return { ...empty, outcome: 'marketplace', detail: 'redirects to marketplace store on www.tokopedia.com' };
    if (site.outcome !== 'ok') return { ...empty, outcome: site.outcome, detail: 'fixture' };
    return {
      outcome: 'ok',
      detail: '',
      httpStatus: 200,
      finalUrl: `https://${site.domain}/`,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      page: page(site, '/'),
      screenshots: { desktop: await placeholderWebp('desktop', site.name), mobile: await placeholderWebp('mobile', site.name) },
    };
  }

  async page(url: string): Promise<FetchedPage | null> {
    return this.site ? page(this.site, new URL(url).pathname) : null;
  }

  async close(): Promise<void> {}
}

export class FixtureFetcher implements SiteFetcher {
  async open(domain: string): Promise<SiteSession> {
    return new FixtureSession(domain, fixtureFor(domain));
  }
  async shutdown(): Promise<void> {}
}
