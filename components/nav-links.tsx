'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/leads', label: 'Leads', match: /^\/(leads|companies)/ },
  { href: '/import', label: 'Import', match: /^\/import/ },
  { href: '/usage', label: 'Usage', match: /^\/usage/ },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active = link.match.test(pathname);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={cn('rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted', active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
