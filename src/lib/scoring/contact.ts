import type { ContactType } from '../types';
import type { SubScore } from './need';
import { CONTACT_POINTS } from './weights';

export interface ScorableContact {
  email: string | null;
  contactType: ContactType;
  role: string | null;
  mxOk: boolean;
}

const FOUNDER_ROLE = /\b(founder|co-?founder|owner|pemilik|pendiri|ceo|director|direktur|principal|proprietor)\b/i;

export function contactPoints(c: ScorableContact): number {
  if (c.contactType === 'form_only') return CONTACT_POINTS.formOnly;
  // An address whose domain cannot receive mail is worth nothing.
  if (!c.email || !c.mxOk) return CONTACT_POINTS.none;
  if (c.contactType === 'named') {
    return c.role && FOUNDER_ROLE.test(c.role) ? CONTACT_POINTS.namedFounder : CONTACT_POINTS.namedOther;
  }
  if (c.contactType === 'role') return CONTACT_POINTS.role;
  return CONTACT_POINTS.generic;
}

export function bestContact<T extends ScorableContact>(contacts: T[]): T | null {
  let best: T | null = null;
  let bestPoints = -1;
  for (const c of contacts) {
    const p = contactPoints(c);
    if (p > bestPoints) {
      best = c;
      bestPoints = p;
    }
  }
  return best;
}

export function scoreContact(contacts: ScorableContact[]): SubScore {
  const best = bestContact(contacts);
  if (!best) return { score: 0, reasons: ['no contact found'] };
  const score = contactPoints(best);
  const label =
    best.contactType === 'form_only'
      ? 'contact form only'
      : !best.mxOk
        ? `${best.email} has no working MX`
        : `${best.contactType} contact ${best.email}${best.role ? ` (${best.role})` : ''}`;
  return { score, reasons: [`${score} ${label}`] };
}
