import type { Metadata } from 'next';
import Link from 'next/link';
import { Filters } from '@/components/leads/filters';
import { LeadsTable } from '@/components/leads/leads-table';
import { cn } from '@/lib/utils';
import { TABS, filterOptions, listLeads, parseFilters, tabCounts, type TabKey } from '@/src/lib/leads/queries';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const TAB_HINT: Record<TabKey, string> = {
  qualified: 'Passed every filter. Sorted by priority.',
  not_qualified: 'Failed at least one filter. You decide: promote to review, or dismiss.',
  auto_excluded: 'Audit only: major brands, dead or parked sites, duplicates and suppressed domains.',
};

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const [counts, options, leads] = await Promise.all([tabCounts(), filterOptions(filters.tab), listLeads(filters)]);

  const pageHref = (page: number) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (typeof value === 'string' && value && key !== 'page') q.set(key, value);
    if (page > 1) q.set('page', String(page));
    return `/leads?${q}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
        <p className="text-sm text-muted-foreground">{TAB_HINT[filters.tab]}</p>
      </div>

      <nav aria-label="Lead tiers" className="flex gap-1 overflow-x-auto border-b">
        {(Object.keys(TABS) as TabKey[]).map((key) => {
          const active = key === filters.tab;
          return (
            <Link
              key={key}
              href={`/leads?tab=${key}`}
              aria-current={active ? 'page' : undefined}
              className={cn('-mb-px flex shrink-0 items-baseline gap-2 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors', active ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground')}
            >
              {TABS[key].label}
              <span className="tabular-nums text-muted-foreground">{counts[key].total}</span>
              {counts[key].today > 0 && <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">+{counts[key].today} today</span>}
            </Link>
          );
        })}
      </nav>

      <Filters filters={filters} options={options} />
      <LeadsTable key={`${filters.tab}-${filters.page}`} rows={leads.rows} tab={filters.tab} />

      {leads.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {filters.page} of {leads.pages} · {leads.total} leads
          </span>
          <div className="flex gap-3">
            {filters.page > 1 && (
              <Link href={pageHref(filters.page - 1)} className="underline-offset-4 hover:underline">
                Previous
              </Link>
            )}
            {filters.page < leads.pages && (
              <Link href={pageHref(filters.page + 1)} className="underline-offset-4 hover:underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
