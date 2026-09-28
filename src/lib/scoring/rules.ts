import { z } from 'zod';

/**
 * Machine form of an approved rule. A lead that MATCHES the condition fails the rule
 * and gets the fail code `rule:<id>`. Example: exclude villa leads with PSI mobile over 80:
 * { "all": [{ "field": "segment", "op": "eq", "value": "villa_developer" }, { "field": "psi_mobile", "op": "gt", "value": 80 }] }
 */
export const RULE_FIELDS = ['segment', 'sub_category', 'country', 'region', 'language', 'platform', 'source', 'psi_mobile', 'psi_desktop', 'design_age', 'need', 'pay', 'contact', 'fit', 'priority', 'best_contact_type', 'price_level'] as const;

const conditionSchema = z.object({
  field: z.enum(RULE_FIELDS),
  op: z.enum(['eq', 'neq', 'in', 'not_in', 'lt', 'lte', 'gt', 'gte', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
});

export const ruleJsonSchema = z.union([conditionSchema, z.object({ all: z.array(conditionSchema).min(1) }), z.object({ any: z.array(conditionSchema).min(1) })]);

export type RuleCondition = z.infer<typeof conditionSchema>;
export type RuleJson = z.infer<typeof ruleJsonSchema>;
export type RuleFacts = Partial<Record<(typeof RULE_FIELDS)[number], string | number | null>>;

function matches(c: RuleCondition, facts: RuleFacts): boolean {
  const actual = facts[c.field];
  // A rule never fires on data we do not have.
  if (actual === null || actual === undefined) return false;
  const same = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
  switch (c.op) {
    case 'eq':
      return same(actual, c.value);
    case 'neq':
      return !same(actual, c.value);
    case 'in':
      return Array.isArray(c.value) && c.value.some((v) => same(actual, v));
    case 'not_in':
      return Array.isArray(c.value) && !c.value.some((v) => same(actual, v));
    case 'contains':
      return String(actual).toLowerCase().includes(String(c.value).toLowerCase());
    case 'lt':
      return Number(actual) < Number(c.value);
    case 'lte':
      return Number(actual) <= Number(c.value);
    case 'gt':
      return Number(actual) > Number(c.value);
    case 'gte':
      return Number(actual) >= Number(c.value);
  }
}

export interface ApplicableRule {
  id: string;
  segment: string | null;
  ruleText: string;
  ruleJson: unknown;
}

/** Approved rules this lead fails. Rules without a valid rule_json are skipped, never guessed. */
export function failedRules(rules: ApplicableRule[], facts: RuleFacts): { id: string; text: string }[] {
  const failed: { id: string; text: string }[] = [];
  for (const rule of rules) {
    if (rule.segment && rule.segment !== facts.segment) continue;
    const parsed = ruleJsonSchema.safeParse(rule.ruleJson);
    if (!parsed.success) continue;
    const r = parsed.data;
    const hit = 'all' in r ? r.all.every((c) => matches(c, facts)) : 'any' in r ? r.any.some((c) => matches(c, facts)) : matches(r, facts);
    if (hit) failed.push({ id: rule.id, text: rule.ruleText });
  }
  return failed;
}
