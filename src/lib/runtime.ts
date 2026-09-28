import { env } from '../config/env';
import { hasMx } from './enrich/mx';
import { runPageSpeed, type PsiResult, type PsiStrategy } from './enrich/pagespeed';
import { PlaywrightFetcher } from './enrich/playwright-fetcher';
import type { SiteFetcher } from './enrich/site';
import { FixtureFetcher } from './fixtures/fetcher';
import { fixtureFor } from './fixtures/sites';

/** Everything enrichment needs from the outside world. Mock mode swaps all of it for fixtures. */
export interface Runtime {
  mode: 'live' | 'mock';
  sites: SiteFetcher;
  pageSpeed(url: string, strategy: PsiStrategy): Promise<PsiResult>;
  mx(email: string): Promise<boolean>;
}

let runtime: Runtime | null = null;

function mockRuntime(): Runtime {
  const siteOf = (urlOrEmail: string) => {
    const host = urlOrEmail.includes('@') ? urlOrEmail.split('@')[1] : new URL(urlOrEmail).host;
    return fixtureFor(host);
  };
  return {
    mode: 'mock',
    sites: new FixtureFetcher(),
    pageSpeed: async (url, strategy) => {
      const site = siteOf(url);
      if (!site) throw new Error(`no fixture for ${url}`);
      return strategy === 'mobile' ? { score: site.psiMobile, lcpMs: site.lcpMsMobile } : { score: site.psiDesktop, lcpMs: null };
    },
    mx: async (email) => siteOf(email)?.mxOk ?? false,
  };
}

export function getRuntime(): Runtime {
  runtime ??= env().LLM_MODE === 'mock' ? mockRuntime() : { mode: 'live', sites: new PlaywrightFetcher(), pageSpeed: runPageSpeed, mx: hasMx };
  return runtime;
}

export async function shutdownRuntime(): Promise<void> {
  await runtime?.sites.shutdown();
  runtime = null;
}
