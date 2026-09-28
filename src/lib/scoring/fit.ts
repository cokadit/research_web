import type { Segment } from '../types';
import type { SubScore } from './need';
import { FIT_POINTS } from './weights';

export interface PortfolioForFit {
  segments: string[];
  active: boolean;
}

export function scoreFit(segment: Segment, portfolio: PortfolioForFit[]): SubScore {
  const active = portfolio.filter((p) => p.active);
  if (active.length === 0) return { score: FIT_POINTS.noPortfolioYet, reasons: ['no portfolio items yet'] };
  const matches = active.filter((p) => p.segments.includes(segment)).length;
  if (matches === 0) return { score: FIT_POINTS.noMatch, reasons: [`no portfolio item tagged ${segment}`] };
  if (matches === 1) return { score: FIT_POINTS.oneMatch, reasons: [`1 portfolio item tagged ${segment}`] };
  return { score: FIT_POINTS.twoOrMoreMatches, reasons: [`${matches} portfolio items tagged ${segment}`] };
}
