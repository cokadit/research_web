import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { normaliseCountry } from '../compliance/regimes';
import { SEGMENTS, SOURCES } from '../types';

const rowSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  website: z.string().trim().min(1, 'website is required'),
  segment: z.enum(SEGMENTS, { message: `segment must be one of ${SEGMENTS.join(', ')}` }),
  country: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? normaliseCountry(v) : null)),
  source: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : 'manual'))
    .pipe(z.enum(SOURCES, { message: `source must be one of ${SOURCES.join(', ')}` })),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
});

export type CsvRow = z.infer<typeof rowSchema>;

export interface CsvParseResult {
  rows: CsvRow[];
  errors: { line: number; message: string }[];
}

export const CSV_COLUMNS = ['name', 'website', 'segment', 'country', 'source', 'notes'] as const;

/** Parses an import file with the header `name, website, segment, country, source, notes`. Bad rows are reported, good rows kept. */
export function parseLeadCsv(content: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [] };
  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (err) {
    result.errors.push({ line: 1, message: err instanceof Error ? err.message : String(err) });
    return result;
  }

  records.forEach((record, i) => {
    const parsed = rowSchema.safeParse(record);
    if (parsed.success) result.rows.push(parsed.data);
    else result.errors.push({ line: i + 2, message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
  });
  return result;
}
