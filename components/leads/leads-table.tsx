'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { dismissLeads, moveToNotQualified, promoteLeads, type ActionResult } from '@/src/lib/leads/actions';
import type { LeadRow, TabKey } from '@/src/lib/leads/queries';
import { FailChips, PsiValue, ScoreCell } from './chips';
import { contactLabel, failLabel, segmentLabel } from './labels';

const REJECT_REASONS = ['too_big', 'site_already_good', 'chain_or_group', 'wrong_segment', 'no_budget_signals', 'bad_contact', 'competitor', 'duplicate', 'other'];

export function LeadsTable({ rows, tab }: { rows: LeadRow[]; tab: TabKey }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState<string[] | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [pending, startTransition] = useTransition();

  const selectable = tab === 'not_qualified';
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setSelected(new Set());
        setDismissing(null);
      } else {
        toast.error(result.message);
      }
    });

  const openDismiss = (ids: string[]) => {
    const codes = new Set(ids.map((id) => byId.get(id)?.failReasons[0]?.code).filter(Boolean));
    // One lead, or several that share a fail code: prefill it. Otherwise each lead keeps its own.
    setReason(codes.size === 1 ? [...codes][0]! : '');
    setNote('');
    setDismissing(ids);
  };

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No leads match. {tab === 'qualified' ? 'Run a cycle with `npm run cycle -- --limit 20`, or loosen the filters.' : 'Loosen the filters to see more.'}
      </div>
    );
  }

  const dismissOptions = [...new Set([...(dismissing ?? []).flatMap((id) => byId.get(id)?.failReasons.map((r) => r.code) ?? []), ...REJECT_REASONS])];

  return (
    <div className="flex flex-col gap-3">
      {selectable && (
        <div className="flex min-h-9 flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="text-muted-foreground">{selected.size === 0 ? 'Select leads for bulk actions.' : `${selected.size} selected`}</span>
          {selected.size > 0 && (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => promoteLeads([...selected]))}>
                Promote to review
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => openDismiss([...selected])}>
                Dismiss
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox aria-label="Select all leads on this page" checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onCheckedChange={(on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set())} />
                </TableHead>
              )}
              <TableHead>Name</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>{tab === 'auto_excluded' ? 'Exclusion reason' : 'Fail codes'}</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>PSI mobile</TableHead>
              <TableHead>Best contact</TableHead>
              <TableHead>Source</TableHead>
              {tab !== 'qualified' && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? 'selected' : undefined}>
                {selectable && (
                  <TableCell>
                    <Checkbox aria-label={`Select ${row.name ?? row.domain}`} checked={selected.has(row.id)} onCheckedChange={(on) => toggle(row.id, Boolean(on))} />
                  </TableCell>
                )}
                <TableCell className="max-w-64">
                  <Link href={`/companies/${row.id}`} className="block truncate font-medium underline-offset-4 hover:underline">
                    {row.name ?? row.domain}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{row.domain}</span>
                </TableCell>
                <TableCell>{segmentLabel(row.segment)}</TableCell>
                <TableCell>{row.country ?? <span className="text-muted-foreground">n/a</span>}</TableCell>
                <TableCell>
                  <ScoreCell priority={row.priority} need={row.need} pay={row.pay} contact={row.contact} fit={row.fit} />
                </TableCell>
                <TableCell className="max-w-72 whitespace-normal">
                  <FailChips reasons={row.failReasons} />
                </TableCell>
                <TableCell>{row.platform && row.platform !== 'null' ? row.platform : <span className="text-muted-foreground">n/a</span>}</TableCell>
                <TableCell>
                  <PsiValue value={row.psiMobile} />
                </TableCell>
                <TableCell>{contactLabel(row.bestContactType)}</TableCell>
                <TableCell className="text-muted-foreground">{row.source}</TableCell>
                {tab === 'not_qualified' && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => promoteLeads([row.id]))}>
                        Promote
                      </Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => openDismiss([row.id])}>
                        Dismiss
                      </Button>
                    </div>
                  </TableCell>
                )}
                {tab === 'auto_excluded' && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moveToNotQualified(row.id))}>
                      Move to Not qualified
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dismissing !== null} onOpenChange={(open) => !open && setDismissing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Dismiss {dismissing?.length === 1 ? (byId.get(dismissing[0])?.name ?? 'lead') : `${dismissing?.length ?? 0} leads`}
            </DialogTitle>
            <DialogDescription>The decision is saved as a label and teaches the system what to skip.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dismiss-reason">Reason</Label>
              <select id="dismiss-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <option value="">Each lead&apos;s own first fail code</option>
                {dismissOptions.map((code) => (
                  <option key={code} value={code}>
                    {failLabel(code)} ({code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dismiss-note">Note {reason === 'other' ? '(required)' : '(optional)'}</Label>
              <Input id="dismiss-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDismissing(null)}>
              Cancel
            </Button>
            <Button disabled={pending || (reason === 'other' && !note.trim())} onClick={() => dismissing && run(() => dismissLeads(dismissing, reason || undefined, note))}>
              {pending ? 'Dismissing…' : 'Dismiss'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
