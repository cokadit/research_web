import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { env } from '../../config/env';
import { CRAWL, SCREENSHOTS } from '../../config/limits';
import { isMarketplaceUrl, isNoCrawlHost } from '../discovery/domain';
import { detectParked } from './parked';
import { politeness } from './politeness';
import { isAllowedByRobots } from './robots';
import { toWebp } from './screenshot';
import { collapse, type FetchedPage, type HomepageResult, type SiteFetcher, type SiteSession } from './site';

const MOBILE_UA_SUFFIX = ' Mobile';

async function readPage(page: Page): Promise<FetchedPage> {
  const [title, html, text, links] = await Promise.all([
    page.title().catch(() => ''),
    page.content(),
    page.evaluate(() => document.body?.innerText ?? '').catch(() => ''),
    page.evaluate(() => Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href)).catch(() => [] as string[]),
  ]);
  return { url: page.url(), title, html, text: collapse(text), links };
}

class PlaywrightSession implements SiteSession {
  private desktop: BrowserContext | null = null;
  /** Set when the site tried to send the browser to a host we never fetch. */
  private blockedRedirect: string | null = null;

  constructor(
    private readonly browser: Browser,
    private readonly domain: string,
  ) {}

  private async context(kind: 'desktop' | 'mobile'): Promise<BrowserContext> {
    const ctx = await this.browser.newContext({
      userAgent: env().CRAWLER_USER_AGENT + (kind === 'mobile' ? MOBILE_UA_SUFFIX : ''),
      viewport: SCREENSHOTS[kind],
      isMobile: kind === 'mobile',
      hasTouch: kind === 'mobile',
      deviceScaleFactor: kind === 'mobile' ? 2 : 1,
      ignoreHTTPSErrors: false,
    });
    ctx.setDefaultTimeout(CRAWL.timeoutMs);
    // Rule 10: never load a page from a social network, marketplace or OTA, even through a redirect.
    await ctx.route('**/*', (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame().parentFrame() === null && isNoCrawlHost(req.url())) {
        this.blockedRedirect = req.url();
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    return ctx;
  }

  private async load(ctx: BrowserContext, url: string): Promise<{ page: Page; response: Response | null }> {
    const page = await ctx.newPage();
    const response = await politeness.run(this.domain, async () => {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CRAWL.timeoutMs });
      // Give client-rendered sites a moment, without waiting on trackers that never go idle.
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      return res;
    });
    return { page, response };
  }

  private async shot(page: Page): Promise<Buffer | null> {
    try {
      return await toWebp(await page.screenshot({ type: 'png', fullPage: false, timeout: CRAWL.timeoutMs }));
    } catch {
      return null;
    }
  }

  async homepage(): Promise<HomepageResult> {
    const empty = { httpStatus: null, finalUrl: null, headers: {}, page: null, screenshots: { desktop: null, mobile: null } };
    const url = `https://${this.domain}/`;

    if (!(await isAllowedByRobots(url))) {
      return { ...empty, outcome: 'robots_blocked', detail: `robots.txt disallows ${url}` };
    }

    this.desktop = await this.context('desktop');
    let loaded: { page: Page; response: Response | null };
    try {
      loaded = await this.load(this.desktop, url);
    } catch (first) {
      if (this.blockedRedirect) return this.redirected(empty);
      // Some small sites still have no TLS certificate.
      try {
        loaded = await this.load(this.desktop, `http://${this.domain}/`);
      } catch {
        if (this.blockedRedirect) return this.redirected(empty);
        const message = first instanceof Error ? first.message.split('\n')[0] : String(first);
        return { ...empty, outcome: 'dead', detail: message.slice(0, 200) };
      }
    }

    const { page, response } = loaded;
    const status = response?.status() ?? null;
    const finalUrl = page.url();
    const headers = response ? await response.allHeaders().catch(() => ({})) : {};

    if (status === null || status < 200 || status >= 300) {
      return { ...empty, httpStatus: status, finalUrl, outcome: 'dead', detail: `HTTP ${status ?? 'no response'}` };
    }

    const fetched = await readPage(page);
    const parked = detectParked({ html: fetched.html, text: fetched.text, finalUrl });
    if (parked.parked) return { ...empty, httpStatus: status, finalUrl, headers, outcome: 'parked', detail: parked.detail };

    const desktop = await this.shot(page);
    let mobile: Buffer | null = null;
    const mobileCtx = await this.context('mobile');
    try {
      const m = await this.load(mobileCtx, finalUrl);
      mobile = await this.shot(m.page);
    } catch {
      mobile = null;
    } finally {
      await mobileCtx.close().catch(() => {});
    }

    return { outcome: 'ok', detail: '', httpStatus: status, finalUrl, headers, page: fetched, screenshots: { desktop, mobile } };
  }

  private redirected(empty: Omit<HomepageResult, 'outcome' | 'detail'>): HomepageResult {
    const target = this.blockedRedirect ?? '';
    const host = new URL(target).host;
    if (isMarketplaceUrl(target)) return { ...empty, outcome: 'marketplace', detail: `redirects to marketplace store on ${host}` };
    return { ...empty, outcome: 'linktree', detail: `redirects to ${host}` };
  }

  async page(url: string): Promise<FetchedPage | null> {
    if (!this.desktop || isNoCrawlHost(url)) return null;
    if (!(await isAllowedByRobots(url))) return null;
    let page: Page | null = null;
    try {
      const loaded = await this.load(this.desktop, url);
      page = loaded.page;
      const status = loaded.response?.status() ?? 0;
      if (status < 200 || status >= 300) return null;
      return await readPage(page);
    } catch {
      return null;
    } finally {
      await page?.close().catch(() => {});
    }
  }

  async close(): Promise<void> {
    await this.desktop?.close().catch(() => {});
    this.desktop = null;
  }
}

export class PlaywrightFetcher implements SiteFetcher {
  private browser: Promise<Browser> | null = null;

  async open(domain: string): Promise<SiteSession> {
    this.browser ??= chromium.launch({ headless: true });
    return new PlaywrightSession(await this.browser, domain);
  }

  async shutdown(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) await (await browser).close().catch(() => {});
  }
}
