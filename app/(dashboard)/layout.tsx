import Link from 'next/link';
import { logout } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { NavLinks } from '@/components/nav-links';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const mock = process.env.LLM_MODE !== 'live';
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
          <Link href="/leads" className="hidden whitespace-nowrap font-semibold tracking-tight sm:block">
            Lead research
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3">
            {mock && (
              <span className="whitespace-nowrap rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                Mock<span className="hidden sm:inline"> mode: fixture data</span>
              </span>
            )}
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}
