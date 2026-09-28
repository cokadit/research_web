'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { failLabel } from './labels';

const TIER1 = new Set(['major_brand', 'dead_site', 'parked_site', 'duplicate', 'suppressed']);

export function FailChips({ reasons }: { reasons: { code: string; detail: string }[] }) {
  if (reasons.length === 0) return <span className="text-muted-foreground">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <Tooltip key={r.code}>
          <TooltipTrigger
            className={cn(
              'cursor-help rounded-md border px-1.5 py-0.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              TIER1.has(r.code) ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200' : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
            )}
          >
            {failLabel(r.code)}
          </TooltipTrigger>
          <TooltipContent>
            <span>
              <span className="font-mono">{r.code}</span>: {r.detail}
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function ScoreCell({ priority, need, pay, contact, fit }: { priority: number | null; need: number | null; pay: number | null; contact: number | null; fit: number | null }) {
  if (priority === null) return <span className="text-muted-foreground">Not scored</span>;
  return (
    <div className="flex items-baseline gap-2 tabular-nums">
      <span className="text-base font-semibold">{priority}</span>
      <span className="text-xs text-muted-foreground" title="Need / Pay / Contact / Fit">
        N{need} P{pay} C{contact} F{fit}
      </span>
    </div>
  );
}

export function PsiValue({ value }: { value: number | null }) {
  if (value === null || Number.isNaN(value)) return <span className="text-muted-foreground">n/a</span>;
  const tone = value < 50 ? 'text-red-700 dark:text-red-400' : value < 90 ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400';
  return <span className={cn('font-medium tabular-nums', tone)}>{value}</span>;
}
