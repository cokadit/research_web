'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { dismissLeads, moveToNotQualified, promoteLeads, type ActionResult } from '@/src/lib/leads/actions';

export function DetailActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });

  if (status === 'not_qualified') {
    return (
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => promoteLeads([id]))}>
          Promote to review
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => dismissLeads([id]))}>
          Dismiss
        </Button>
      </div>
    );
  }
  if (status === 'auto_excluded') {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => moveToNotQualified(id))}>
        Move to Not qualified
      </Button>
    );
  }
  return null;
}
