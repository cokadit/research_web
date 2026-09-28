import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = (await searchParams).next;
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6">
        <h1 className="text-lg font-semibold">Lead research</h1>
        <p className="mb-6 mt-1 text-sm text-muted-foreground">Private dashboard. Sign in to continue.</p>
        <LoginForm next={typeof next === 'string' ? next : ''} />
      </div>
    </main>
  );
}
