import type { Segment } from '../types';
import { scoreContact, type ScorableContact } from './contact';
import { scoreFit, type PortfolioForFit } from './fit';
import { evaluateGates, type GateResults } from './gates';
import { scoreNeed, type NeedInput } from './need';
import { scorePay } from './pay';
import type { PaySignals } from '../types';
import { WEIGHTS, WEIGHTS_VERSION } from './weights';

export interface SubScores {
  need: number;
  pay: number;
  contact: number;
  fit: number;
}

export function priority(s: SubScores, weights: SubScores = WEIGHTS): number {
  const raw = weights.need * s.need + weights.pay * s.pay + weights.contact * s.contact + weights.fit * s.fit;
  // Guard against float noise such as 64.99999999 before rounding.
  return Math.round(Number(raw.toFixed(6)));
}

export interface ScoreInput {
  segment: Segment;
  need: NeedInput;
  paySignals: PaySignals | null;
  contacts: ScorableContact[];
  portfolio: PortfolioForFit[];
}

export interface ScoreResult extends SubScores {
  priority: number;
  gates: GateResults;
  reasons: { need: string[]; pay: string[]; contact: string[]; fit: string[] };
  weightsVersion: string;
}

export function computeScore(input: ScoreInput): ScoreResult {
  const need = scoreNeed(input.need);
  const pay = scorePay(input.segment, input.paySignals);
  const contact = scoreContact(input.contacts);
  const fit = scoreFit(input.segment, input.portfolio);
  const subs = { need: need.score, pay: pay.score, contact: contact.score, fit: fit.score };
  return {
    ...subs,
    priority: priority(subs),
    gates: evaluateGates(subs.need, subs.contact),
    reasons: { need: need.reasons, pay: pay.reasons, contact: contact.reasons, fit: fit.reasons },
    weightsVersion: WEIGHTS_VERSION,
  };
}
