import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LeadFilters } from '@/src/lib/leads/queries';
import { SEGMENTS, SOURCES } from '@/src/lib/types';
import { failLabel, segmentLabel } from './labels';

const selectClass = 'h-8 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Plain GET form: filters live in the URL, so a filtered view can be bookmarked. */
export function Filters({ filters, options }: { filters: LeadFilters; options: { countries: string[]; regions: string[]; failCodes: string[] } }) {
  const active = Boolean(filters.country || filters.region || filters.segment || filters.source || filters.failCode || filters.minScore || filters.q);
  return (
    <form method="get" action="/leads" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="tab" value={filters.tab} />
      <Field label="Search" id="f-q">
        <Input id="f-q" name="q" defaultValue={filters.q ?? ''} placeholder="Name or domain" className="h-8 w-44" />
      </Field>
      <Field label="Segment" id="f-segment">
        <select id="f-segment" name="segment" defaultValue={filters.segment ?? ''} className={selectClass}>
          <option value="">All</option>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Country" id="f-country">
        <select id="f-country" name="country" defaultValue={filters.country ?? ''} className={selectClass}>
          <option value="">All</option>
          {options.countries.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Region" id="f-region">
        <select id="f-region" name="region" defaultValue={filters.region ?? ''} className={selectClass}>
          <option value="">All</option>
          {options.regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Source" id="f-source">
        <select id="f-source" name="source" defaultValue={filters.source ?? ''} className={selectClass}>
          <option value="">All</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Min priority" id="f-min">
        <Input id="f-min" name="min" type="number" min={0} max={100} defaultValue={filters.minScore ?? ''} className="h-8 w-24" />
      </Field>
      {filters.tab !== 'qualified' && (
        <Field label="Fail code" id="f-fail">
          <select id="f-fail" name="fail" defaultValue={filters.failCode ?? ''} className={selectClass}>
            <option value="">All</option>
            {options.failCodes.map((c) => (
              <option key={c} value={c}>
                {failLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Button type="submit" size="sm" variant="outline">
        Apply
      </Button>
      {active && (
        <Link href={`/leads?tab=${filters.tab}`} className="pb-1.5 text-sm text-muted-foreground underline-offset-4 hover:underline">
          Clear filters
        </Link>
      )}
    </form>
  );
}
