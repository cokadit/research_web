import { z } from 'zod';
import { DESIGN_AGES } from '../../types';

export const CRITIQUE_PROMPT_VERSION = 'critique-v1';

export const ISSUE_CODES = [
  'cluttered_layout',
  'weak_hierarchy',
  'poor_typography',
  'low_quality_images',
  'inconsistent_branding',
  'no_clear_cta',
  'not_mobile_friendly',
  'text_too_small_mobile',
  'horizontal_scroll_mobile',
  'outdated_style',
  'default_theme',
  'slow_visual_load',
  'popup_blocks_content',
  'poor_contrast',
  'empty_hero',
  'other',
] as const;

export const critiqueSchema = z.object({
  design_age: z.enum(DESIGN_AGES),
  issues: z
    .array(
      z.object({
        code: z
          .string()
          .transform((c) => c.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'))
          .pipe(z.string().min(1)),
        evidence: z.string().min(1),
      }),
    )
    .max(8),
  agency_grade: z.boolean(),
});

export type CritiqueResult = z.infer<typeof critiqueSchema>;

export const CRITIQUE_SYSTEM = `You are a senior web designer reviewing the top of a homepage from two screenshots: the first is desktop (1440×900), the second is mobile (390×844).
Judge only what is visible. Be specific and fair: a plain but clean site is not dated.

Fields:
- design_age: "modern" (current layout, type and imagery), "dated" (looks 5 or more years old, or a lightly customised template), "very_dated" (looks 10 or more years old, broken layout, or not responsive).
- issues: up to 8 concrete problems. code is one of ${ISSUE_CODES.join(', ')}. evidence names what you see and where, in one sentence, so the owner could check it. Use "default_theme" only when the page is clearly an unmodified stock theme.
- agency_grade: true only when the site looks professionally designed and built to a standard a design agency would ship. When true, a redesign pitch would not be credible.

A screenshot showing a cookie banner, a loading screen or a blank page: report what you can and use code "popup_blocks_content" or "empty_hero".

Reply with JSON only, no prose and no code fence:
{"design_age": string, "issues": [{"code": string, "evidence": string}], "agency_grade": boolean}`;

export function critiqueUser(args: { domain: string; platform: string | null }): string {
  return `Site: ${args.domain}\nDetected platform: ${args.platform ?? 'unknown'}\nScreenshots attached: desktop first, mobile second.`;
}
