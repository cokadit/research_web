import type { PriceLevel } from '../types';

export const WEIGHTS_VERSION = 'w1-2026-09';

export const WEIGHTS = { need: 0.4, pay: 0.3, contact: 0.2, fit: 0.1 } as const;

export const GATES = { need: 50, contact: 40 } as const;

export const SITE_ALREADY_GOOD_PSI = 85;

export const NEED_POINTS = {
  psiMobileBelow50: 30,
  psiMobile50to69: 15,
  designDated: 20,
  designVeryDated: 25,
  defaultThemeOrLinktree: 20,
  missingKeyFeature: 15,
  noEnglishOrMulticurrency: 10,
} as const;

export const CONTACT_POINTS = {
  namedFounder: 100,
  // The spec only fixes named founder/owner (100). A named person with another or unknown role sits between that and a role address.
  namedOther: 85,
  role: 70,
  generic: 40,
  formOnly: 10,
  none: 0,
} as const;

export const FIT_POINTS = { noPortfolioYet: 50, noMatch: 30, oneMatch: 80, twoOrMoreMatches: 100 } as const;

type PriceTable = Record<PriceLevel, number>;
type Step = readonly [min: number, points: number];

export interface PayRubric {
  price: PriceTable;
  reviews: readonly Step[];
  following: readonly Step[];
  projects: readonly Step[];
  exporter: number;
  tradeShow: number;
}

// Steps are checked top down, first match wins.
export const PAY_RUBRICS = {
  fashion: {
    price: { low: 5, mid: 20, high: 35, luxury: 40 },
    reviews: [[500, 15], [100, 10], [20, 5]],
    following: [[50_000, 30], [10_000, 20], [1_000, 10]],
    projects: [],
    exporter: 10,
    tradeShow: 5,
  },
  furniture: {
    price: { low: 5, mid: 15, high: 25, luxury: 30 },
    reviews: [[100, 10], [20, 5]],
    following: [[10_000, 10], [1_000, 5]],
    projects: [],
    exporter: 30,
    tradeShow: 20,
  },
  villa_developer: {
    price: { low: 5, mid: 15, high: 25, luxury: 35 },
    reviews: [[100, 15], [20, 10]],
    following: [[10_000, 10], [1_000, 5]],
    projects: [[3, 40], [2, 30], [1, 20]],
    exporter: 0,
    tradeShow: 0,
  },
  hotel: {
    price: { low: 5, mid: 20, high: 35, luxury: 45 },
    reviews: [[1_000, 35], [300, 25], [50, 15]],
    following: [[10_000, 20], [1_000, 10]],
    projects: [],
    exporter: 0,
    tradeShow: 0,
  },
  real_estate_agency: {
    price: { low: 5, mid: 15, high: 25, luxury: 35 },
    reviews: [[100, 20], [20, 10]],
    following: [[10_000, 15], [1_000, 5]],
    projects: [[10, 30], [3, 20], [1, 10]],
    exporter: 0,
    tradeShow: 0,
  },
} as const satisfies Record<string, PayRubric>;
