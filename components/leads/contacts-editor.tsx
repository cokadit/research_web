'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { deleteContact, saveContact } from '@/src/lib/leads/actions';
import { contactLabel } from './labels';

export interface EditableContact {
  id: string;
  email: string | null;
  name: string | null;
  role: string | null;
  contactType: string;
  mxOk: boolean;
  isPrimary: boolean;
  manual: boolean;
  foundOnUrl: string | null;
}

const TYPES = ['', 'named', 'role', 'generic'] as const;
const blank = { contactId: undefined as string | undefined, email: '', name: '', role: '', contactType: '' as (typeof TYPES)[number] };
const selectClass = 'h-8 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function ContactsEditor({ companyId, contacts }: { companyId: string; contacts: EditableContact[] }) {
  const [form, setForm] = useState(blank);
  const [pending, startTransition] = useTransition();
  const editing = Boolean(form.contactId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveContact({ companyId, contactId: form.contactId, email: form.email, name: form.name, role: form.role, contactType: form.contactType || undefined });
      if (result.ok) {
        toast.success(result.message);
        setForm(blank);
      } else {
        toast.error(result.message);
      }
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteContact(companyId, id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      if (form.contactId === id) setForm(blank);
    });

  return (
    <div className="flex flex-col gap-4">
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contact found yet. Add one below if you find it yourself.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>MX</TableHead>
                <TableHead>Found on</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    {c.email ?? <span className="text-muted-foreground">Contact form</span>}
                    {c.isPrimary && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal">Best</span>}
                  </TableCell>
                  <TableCell>{c.name ?? ''}</TableCell>
                  <TableCell>{c.role ?? ''}</TableCell>
                  <TableCell>{contactLabel(c.contactType)}</TableCell>
                  <TableCell>{c.email ? (c.mxOk ? 'OK' : <span className="text-destructive">No mail server</span>) : ''}</TableCell>
                  <TableCell className="max-w-56 truncate text-muted-foreground">{c.manual ? 'Added by you' : (c.foundOnUrl ?? '')}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {c.email && (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setForm({ contactId: c.id, email: c.email ?? '', name: c.name ?? '', role: c.role ?? '', contactType: (TYPES as readonly string[]).includes(c.contactType) ? (c.contactType as (typeof TYPES)[number]) : '' })}>
                          Edit
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => remove(c.id)}>
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="c-email" className="text-xs font-medium text-muted-foreground">
            Email
          </label>
          <Input id="c-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-8 w-60" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="c-name" className="text-xs font-medium text-muted-foreground">
            Name
          </label>
          <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-8 w-44" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="c-role" className="text-xs font-medium text-muted-foreground">
            Role
          </label>
          <Input id="c-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Founder, Sales…" className="h-8 w-40" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="c-type" className="text-xs font-medium text-muted-foreground">
            Type
          </label>
          <select id="c-type" value={form.contactType} onChange={(e) => setForm({ ...form, contactType: e.target.value as (typeof TYPES)[number] })} className={selectClass}>
            <option value="">Detect from email</option>
            <option value="named">Named</option>
            <option value="role">Role</option>
            <option value="generic">Generic</option>
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
        </Button>
        {editing && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setForm(blank)}>
            Cancel
          </Button>
        )}
      </form>
    </div>
  );
}
