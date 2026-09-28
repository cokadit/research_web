import { z } from 'zod';

export const psiResponseSchema = z.object({
  lighthouseResult: z.object({
    finalUrl: z.string().optional(),
    runtimeError: z.object({ code: z.string().optional(), message: z.string().optional() }).optional(),
    categories: z.object({ performance: z.object({ score: z.number().nullable() }).optional() }).optional(),
    audits: z
      .record(
        z.string(),
        z.looseObject({
          // TODO(verify): `numericValue` is standard Lighthouse output but is not named in the PSI docs. Confirm with a live call once a key exists.
          numericValue: z.number().optional(),
        }),
      )
      .optional(),
  }),
});

export const psiErrorSchema = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional(), status: z.string().optional() }) });

export type PsiStrategy = 'mobile' | 'desktop';

export interface PsiResult {
  score: number | null;
  lcpMs: number | null;
}

export function parsePsiResponse(json: unknown): PsiResult {
  const parsed = psiResponseSchema.parse(json);
  const lh = parsed.lighthouseResult;
  if (lh.runtimeError?.code && lh.runtimeError.code !== 'NO_ERROR') {
    throw new Error(`Lighthouse ${lh.runtimeError.code}: ${lh.runtimeError.message ?? 'run failed'}`);
  }
  const raw = lh.categories?.performance?.score ?? null;
  const lcp = lh.audits?.['largest-contentful-paint']?.numericValue;
  return { score: raw === null ? null : Math.round(raw * 100), lcpMs: lcp === undefined ? null : Math.round(lcp) };
}
