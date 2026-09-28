import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { env } from '@/src/config/env';
import { usageToday } from '@/src/lib/leads/queries';
import { claudeHealth } from '@/src/lib/llm/claude-cli';

export const metadata: Metadata = { title: 'Usage' };
export const dynamic = 'force-dynamic';

export default async function UsagePage() {
  const [{ llm, api }, claude] = await Promise.all([usageToday(), claudeHealth()]);
  const e = env();
  const places = api.filter((a) => a.api === 'places').reduce((sum, a) => sum + a.month, 0);
  const num = (n: number) => n.toLocaleString('en-US');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
        <p className="text-sm text-muted-foreground">Calls made today (Bali time) and this month.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Mode</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{e.LLM_MODE === 'live' ? 'Live' : 'Mock (fixtures, no network)'}</p>
            <p className="text-muted-foreground">Sending is {e.SEND_ENABLED ? 'ON' : 'off'}.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Places this month</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {e.PLACES_ENABLED ? (
              <>
                <p className="font-medium tabular-nums">
                  {num(places)} of {num(e.PLACES_MONTHLY_CAP)} calls
                </p>
                {places >= e.PLACES_MONTHLY_CAP && <p className="text-destructive">Cap reached. Places discovery is paused until next month.</p>}
              </>
            ) : (
              <p className="text-muted-foreground">Off. Set PLACES_ENABLED=true and add a key to use it.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Claude CLI</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-medium">{claude.authMode === 'subscription' ? 'Subscription login' : claude.authMode.replace(/_/g, ' ')}</p>
            <p className="text-muted-foreground">{claude.detail}</p>
            {claude.apiKeyInParentEnv && <p className="text-destructive">ANTHROPIC_API_KEY is set in this environment. It is stripped before the CLI runs.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>LLM calls today</CardTitle>
          <CardDescription>Per provider, model and task.</CardDescription>
        </CardHeader>
        <CardContent>
          {llm.length === 0 ? (
            <p className="text-sm text-muted-foreground">No LLM calls today.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Grounded</TableHead>
                    <TableHead className="text-right">Tokens in</TableHead>
                    <TableHead className="text-right">Tokens out</TableHead>
                    <TableHead className="text-right">Avg time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {llm.map((r) => (
                    <TableRow key={`${r.provider}-${r.model}-${r.task}`}>
                      <TableCell>{r.provider}</TableCell>
                      <TableCell className="font-mono text-xs">{r.model}</TableCell>
                      <TableCell>{r.task}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.calls)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${r.failed > 0 ? 'text-destructive' : ''}`}>{num(r.failed)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.grounded)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.tokensIn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.tokensOut)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.avgMs / 1000).toFixed(1)} s</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Other API calls</CardTitle>
          <CardDescription>PageSpeed Insights and Places.</CardDescription>
        </CardHeader>
        <CardContent>
          {api.length === 0 ? (
            <p className="text-sm text-muted-foreground">No API calls this month.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>API</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Today</TableHead>
                  <TableHead className="text-right">Failed today</TableHead>
                  <TableHead className="text-right">This month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {api.map((r) => (
                  <TableRow key={`${r.api}-${r.sku}`}>
                    <TableCell>{r.api}</TableCell>
                    <TableCell>{r.sku ?? ''}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.today)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${r.failedToday > 0 ? 'text-destructive' : ''}`}>{num(r.failedToday)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.month)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
