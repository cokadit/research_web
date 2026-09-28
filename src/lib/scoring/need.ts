import type { DesignAge, Weakness } from '../types';
import { NEED_POINTS } from './weights';

// Weakness codes that feed the Need score. Set by classify, critique and tech detection.
export const NEED_CODES = {
  defaultTheme: 'default_theme',
  linktreeOnly: 'linktree_only',
  missingKeyFeature: 'missing_key_feature',
  noEnglish: 'no_english',
  noMulticurrency: 'no_multicurrency',
} as const;

export interface NeedInput {
  psiMobile: number | null;
  designAge: DesignAge | null;
  weaknesses: Pick<Weakness, 'code'>[];
  sellsAbroad: boolean;
}

export interface SubScore {
  score: number;
  reasons: string[];
}

export function scoreNeed(input: NeedInput): SubScore {
  const codes = new Set(input.weaknesses.map((w) => w.code));
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  if (input.psiMobile !== null) {
    if (input.psiMobile < 50) add(NEED_POINTS.psiMobileBelow50, `PSI mobile ${input.psiMobile} (< 50)`);
    else if (input.psiMobile < 70) add(NEED_POINTS.psiMobile50to69, `PSI mobile ${input.psiMobile} (50–69)`);
  } else {
    reasons.push('PSI mobile unavailable');
  }

  if (input.designAge === 'very_dated') add(NEED_POINTS.designVeryDated, 'design very dated');
  else if (input.designAge === 'dated') add(NEED_POINTS.designDated, 'design dated');

  if (codes.has(NEED_CODES.defaultTheme) || codes.has(NEED_CODES.linktreeOnly)) {
    add(NEED_POINTS.defaultThemeOrLinktree, codes.has(NEED_CODES.linktreeOnly) ? 'Linktree only' : 'default theme');
  }

  if (codes.has(NEED_CODES.missingKeyFeature)) add(NEED_POINTS.missingKeyFeature, 'missing key feature for segment');

  if (input.sellsAbroad && (codes.has(NEED_CODES.noEnglish) || codes.has(NEED_CODES.noMulticurrency))) {
    add(NEED_POINTS.noEnglishOrMulticurrency, 'sells abroad without English or multi-currency');
  }

  return { score: Math.min(100, score), reasons };
}
