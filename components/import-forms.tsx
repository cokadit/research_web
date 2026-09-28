'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { importCsv, quickAdd, type ImportResult } from '@/src/lib/leads/actions';
import { SEGMENTS, type Segment } from '@/src/lib/types';
import { segmentLabel } from './leads/labels';

const selectClass = 'h-9 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';
const SKIP_TEXT: Record<string, string> = { invalid_url: 'not a valid website address', already_known: 'already in the system', suppressed: 'on the suppression list', duplicate_in_batch: 'listed twice in the file', no_crawl_host: 'host cannot be added' };

export function CsvImport() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const r = await importCsv(data);
      setResult(r);
      if (r.ok) {
        toast.success(r.message);
        form.reset();
      } else {
        toast.error(r.message);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="csv-file">CSV file</Label>
          <Input id="csv-file" name="file" type="file" accept=".csv,text/csv" required className="w-72" />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Importing…' : 'Import'}
        </Button>
      </form>

      {result && (
        <div className="flex flex-col gap-3 text-sm" aria-live="polite">
          <p className="font-medium">{result.message}</p>
          {result.errors.length > 0 && (
            <div>
              <h3 className="font-medium text-destructive">Invalid rows</h3>
              <ul className="text-muted-foreground">
                {result.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.skipped.length > 0 && (
            <div>
              <h3 className="font-medium">Skipped</h3>
              <ul className="text-muted-foreground">
                {result.skipped.slice(0, 50).map((s, i) => (
                  <li key={i}>
                    {s.input}: {SKIP_TEXT[s.reason] ?? s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const blank = { name: '', website: '', segment: 'fashion' as Segment, country: '', notes: '' };

export function QuickAdd() {
  const [form, setForm] = useState(blank);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const r = await quickAdd(form);
      if (r.ok) {
        toast.success(r.message);
        setForm({ ...blank, segment: form.segment });
      } else {
        toast.error(r.message);
      }
    });
  };

  return (
    <form onSubmit={submit} className="grid max-w-2xl gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="qa-name">Brand name</Label>
        <Input id="qa-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="qa-website">Website or profile link</Label>
        <Input id="qa-website" required value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="brand.com or instagram.com/brand" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="qa-segment">Segment</Label>
        <select id="qa-segment" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value as Segment })} className={selectClass}>
          {SEGMENTS.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="qa-country">Country code (optional)</Label>
        <Input id="qa-country" value={form.country} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} placeholder="ID" className="w-24" />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="qa-notes">Notes (optional)</Label>
        <Textarea id="qa-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add brand'}
        </Button>
      </div>
    </form>
  );
}
