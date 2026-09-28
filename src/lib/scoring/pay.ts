import type { PaySignals, Segment } from '../types';
import type { SubScore } from './need';
import { PAY_RUBRICS, type PayRubric } from './weights';

function step(value: number | null, steps: PayRubric['reviews']): number {
  if (value === null) return 0;
  for (const [min, points] of steps) if (value >= min) return points;
  return 0;
}

function scoreWithRubric(signals: PaySignals, rubric: PayRubric): SubScore {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    if (points <= 0) return;
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  if (signals.price_level) add(rubric.price[signals.price_level], `price level ${signals.price_level}`);
  add(step(signals.review_count, rubric.reviews), `${signals.review_count} reviews`);
  add(step(signals.social_following, rubric.following), `${signals.social_following} followers`);
  add(step(signals.active_projects, rubric.projects), `${signals.active_projects} active projects`);
  if (signals.is_exporter) add(rubric.exporter, 'exporter');
  if (signals.trade_show_presence) add(rubric.tradeShow, 'trade-show presence');

  if (reasons.length === 0) reasons.push('no pay signals found');
  return { score: Math.min(100, score), reasons };
}

export const scorePayFashion = (s: PaySignals) => scoreWithRubric(s, PAY_RUBRICS.fashion);
export const scorePayFurniture = (s: PaySignals) => scoreWithRubric(s, PAY_RUBRICS.furniture);
export const scorePayVillaDeveloper = (s: PaySignals) => scoreWithRubric(s, PAY_RUBRICS.villa_developer);
export const scorePayHotel = (s: PaySignals) => scoreWithRubric(s, PAY_RUBRICS.hotel);
export const scorePayRealEstate = (s: PaySignals) => scoreWithRubric(s, PAY_RUBRICS.real_estate_agency);

const BY_SEGMENT: Record<Segment, (s: PaySignals) => SubScore> = {
  fashion: scorePayFashion,
  furniture: scorePayFurniture,
  villa_developer: scorePayVillaDeveloper,
  hotel: scorePayHotel,
  real_estate_agency: scorePayRealEstate,
};

export const EMPTY_PAY_SIGNALS: PaySignals = {
  price_level: null,
  review_count: null,
  social_following: null,
  active_projects: null,
  is_exporter: null,
  trade_show_presence: null,
  evidence: [],
};

export function scorePay(segment: Segment, signals: PaySignals | null): SubScore {
  return BY_SEGMENT[segment](signals ?? EMPTY_PAY_SIGNALS);
}
