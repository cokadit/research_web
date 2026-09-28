'use server';

import { and, eq, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '../../db/client';
import { companies, contacts, labels } from '../../db/schema';
import { parseLeadCsv } from '../discovery/csv';
import { insertCandidates, type Candidate } from '../discovery/insert';
import { classifyContactType } from '../enrich/contacts';
import { getRuntime } from '../runtime';
import { enqueueEnrich } from '../queue';
import { scoreCompany } from '../scoring/service';
import { requireSession } from '../session';
import { CONTACT_TYPES, SEGMENTS, SOURCES, type Source } from '../types';

export interface ActionResult {
  ok: boolean;
  message: string;
}

const ids = z.array(z.uuid()).min(1).max(500);

function refresh(companyId?: string) {
  revalidatePath('/leads');
  if (companyId) revalidatePath(`/companies/${companyId}`);
}

/** Moves not-qualified leads into review and records which fail codes I overrode. */
export async function promoteLeads(rawIds: string[], note?: string): Promise<ActionResult> {
  await requireSession();
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return { ok: false, message: 'No valid leads selected.' };

  const rows = await db
    .select({ id: companies.id, failReasons: companies.failReasons })
    .from(companies)
    .where(and(inArray(companies.id, parsed.data), eq(companies.status, 'not_qualified')));
  if (rows.length === 0) return { ok: false, message: 'Nothing to promote. The leads may have moved already.' };

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(labels).values({
        companyId: row.id,
        origin: 'not_qualified_table',
        decision: 'promote',
        overriddenCodes: row.failReasons.map((r) => r.code),
        note: note?.trim() || null,
      });
      await tx.update(companies).set({ status: 'in_review', promoted: true, promotedAt: new Date() }).where(eq(companies.id, row.id));
    }
  });
  refresh();
  return { ok: true, message: `${rows.length} lead${rows.length === 1 ? '' : 's'} promoted to review.` };
}

/** Dismisses not-qualified leads. The reason defaults to each lead's first fail code. */
export async function dismissLeads(rawIds: string[], reasonCode?: string, note?: string): Promise<ActionResult> {
  await requireSession();
  const parsed = ids.safeParse(rawIds);
  if (!parsed.success) return { ok: false, message: 'No valid leads selected.' };
  const reason = reasonCode?.trim().slice(0, 80) || null;
  if (reason === 'other' && !note?.trim()) return { ok: false, message: 'Reason "other" needs a note.' };

  const rows = await db
    .select({ id: companies.id, failReasons: companies.failReasons })
    .from(companies)
    .where(and(inArray(companies.id, parsed.data), eq(companies.status, 'not_qualified')));
  if (rows.length === 0) return { ok: false, message: 'Nothing to dismiss. The leads may have moved already.' };

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx.insert(labels).values({
        companyId: row.id,
        origin: 'not_qualified_table',
        decision: 'dismiss',
        reasonCode: reason ?? row.failReasons[0]?.code ?? 'other',
        note: note?.trim() || null,
      });
      await tx.update(companies).set({ status: 'dismissed' }).where(eq(companies.id, row.id));
    }
  });
  refresh();
  return { ok: true, message: `${rows.length} lead${rows.length === 1 ? '' : 's'} dismissed.` };
}

/** For when the automatic exclusion was wrong. The lead stays visible from now on. */
export async function moveToNotQualified(id: string): Promise<ActionResult> {
  await requireSession();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: 'Invalid lead.' };
  const moved = await db
    .update(companies)
    .set({ status: 'not_qualified', manualTier: true })
    .where(and(eq(companies.id, id), eq(companies.status, 'auto_excluded')))
    .returning({ id: companies.id });
  if (moved.length === 0) return { ok: false, message: 'This lead is no longer auto-excluded.' };
  refresh(id);
  return { ok: true, message: 'Moved to Not qualified.' };
}

const contactInput = z.object({
  companyId: z.uuid(),
  contactId: z.uuid().optional(),
  email: z.email('Enter a valid email address.').transform((e) => e.toLowerCase()),
  name: z.string().trim().max(120).optional(),
  role: z.string().trim().max(120).optional(),
  contactType: z.enum(CONTACT_TYPES).exclude(['form_only']).optional(),
});

/** Adds or edits a contact, checks MX, then rescores the lead. */
export async function saveContact(input: z.input<typeof contactInput>): Promise<ActionResult> {
  await requireSession();
  const parsed = contactInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid contact.' };
  const c = parsed.data;

  const [company] = await db.select({ domain: companies.domain }).from(companies).where(eq(companies.id, c.companyId));
  if (!company) return { ok: false, message: 'Lead not found.' };

  const mxOk = await getRuntime().mx(c.email);
  const values = {
    email: c.email,
    name: c.name || null,
    role: c.role || null,
    contactType: c.contactType ?? classifyContactType(c.email, company.domain),
    mxOk,
    manual: true,
  };

  try {
    if (c.contactId) {
      await db.update(contacts).set(values).where(and(eq(contacts.id, c.contactId), eq(contacts.companyId, c.companyId)));
    } else {
      await db.insert(contacts).values({ companyId: c.companyId, foundOnUrl: null, ...values });
      // A real address replaces the "form only" placeholder.
      await db.delete(contacts).where(and(eq(contacts.companyId, c.companyId), eq(contacts.contactType, 'form_only')));
    }
  } catch {
    return { ok: false, message: 'This lead already has a contact with that email.' };
  }

  await scoreCompany(c.companyId);
  refresh(c.companyId);
  return { ok: true, message: mxOk ? 'Contact saved and lead rescored.' : 'Contact saved, but its domain has no mail server (MX). It scores 0 until that changes.' };
}

export async function deleteContact(companyId: string, contactId: string): Promise<ActionResult> {
  await requireSession();
  if (!z.uuid().safeParse(companyId).success || !z.uuid().safeParse(contactId).success) return { ok: false, message: 'Invalid contact.' };
  await db.delete(contacts).where(and(eq(contacts.id, contactId), eq(contacts.companyId, companyId)));
  await scoreCompany(companyId);
  refresh(companyId);
  return { ok: true, message: 'Contact deleted and lead rescored.' };
}

async function insertAndQueue(candidates: Candidate[], source: Source) {
  const result = await insertCandidates(candidates, { source, allowNoCrawl: true });
  let queued = 0;
  let queueError: string | null = null;
  for (const c of result.inserted) {
    try {
      await enqueueEnrich(c.id);
      queued++;
    } catch (err) {
      queueError = err instanceof Error ? err.message : String(err);
    }
  }
  return { result, queued, queueError };
}

export interface ImportResult extends ActionResult {
  inserted: number;
  skipped: { input: string; reason: string }[];
  errors: { line: number; message: string }[];
}

export async function importCsv(formData: FormData): Promise<ImportResult> {
  await requireSession();
  const empty = { inserted: 0, skipped: [], errors: [] };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a CSV file first.', ...empty };
  if (file.size > 4 * 1024 * 1024) return { ok: false, message: 'File is larger than 4 MB. Split it and upload in parts.', ...empty };

  const parsed = parseLeadCsv(await file.text());
  if (parsed.rows.length === 0) return { ok: false, message: 'No valid rows found.', ...empty, errors: parsed.errors };

  let inserted = 0;
  const skipped: ImportResult['skipped'] = [];
  let queueError: string | null = null;
  // Rows carry their own source, so group by it.
  for (const source of SOURCES) {
    const rows = parsed.rows.filter((r) => r.source === source);
    if (rows.length === 0) continue;
    const out = await insertAndQueue(
      rows.map((r) => ({ name: r.name, websiteUrl: r.website, segment: r.segment, country: r.country, notes: r.notes })),
      source,
    );
    inserted += out.result.inserted.length;
    skipped.push(...out.result.skipped);
    queueError ??= out.queueError;
  }
  refresh();
  const tail = queueError ? ` Could not queue enrichment (${queueError}). Is the worker running?` : '';
  return { ok: !queueError, message: `${inserted} lead${inserted === 1 ? '' : 's'} imported, ${skipped.length} skipped, ${parsed.errors.length} invalid row${parsed.errors.length === 1 ? '' : 's'}.${tail}`, inserted, skipped, errors: parsed.errors };
}

const quickAddInput = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(200),
  website: z.string().trim().min(4, 'Website or profile link is required.').max(500),
  segment: z.enum(SEGMENTS),
  country: z.string().trim().max(2).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function quickAdd(input: z.input<typeof quickAddInput>): Promise<ActionResult> {
  await requireSession();
  const parsed = quickAddInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  const v = parsed.data;
  const { result, queueError } = await insertAndQueue([{ name: v.name, websiteUrl: v.website, segment: v.segment, country: v.country || null, notes: v.notes || null }], 'manual');
  if (result.inserted.length === 0) {
    const reason = result.skipped[0]?.reason ?? 'invalid_url';
    const text: Record<string, string> = { invalid_url: 'That link is not a valid website address.', already_known: 'This brand is already in the system.', suppressed: 'This domain is on the suppression list.', duplicate_in_batch: 'Duplicate.', no_crawl_host: 'That host cannot be added.' };
    return { ok: false, message: text[reason] };
  }
  refresh();
  if (queueError) return { ok: false, message: `Added, but enrichment could not be queued (${queueError}). Is the worker running?` };
  return { ok: true, message: `${v.name} added. Enrichment is queued.` };
}
