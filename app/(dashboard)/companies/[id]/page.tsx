import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PsiValue } from '@/components/leads/chips';
import { failLabel, segmentLabel } from '@/components/leads/labels';
import { ContactsEditor } from '@/components/leads/contacts-editor';
import { DetailActions } from '@/components/leads/detail-actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getCompanyDetail } from '@/src/lib/leads/queries';
import { GATES, WEIGHTS } from '@/src/lib/scoring/weights';

export const metadata: Metadata = { title: 'Company' };
export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<string, string> = { scored: 'Qualified', not_qualified: 'Not qualified', auto_excluded: 'Auto-excluded', in_review: 'In review', new: 'New', enriching: 'Enriching', enriched: 'Enriched', dismissed: 'Dismissed' };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children ?? <span className="text-muted-foreground">n/a</span>}</dd>
    </div>
  );
}

function yesNo(value: boolean | null | undefined) {
  return value === null || value === undefined ? null : value ? 'Yes' : 'No';
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();
  const { company, signal, score, contacts, labels } = detail;
  const isUrl = !company.noCrawl;

  const subScores = score
    ? ([
        { key: 'need', label: 'Need', value: score.need, weight: WEIGHTS.need, gate: GATES.need, reasons: score.reasons.need, pass: score.gates.need.pass },
        { key: 'pay', label: 'Ability to pay', value: score.pay, weight: WEIGHTS.pay, gate: null, reasons: score.reasons.pay, pass: true },
        { key: 'contact', label: 'Contact', value: score.contact, weight: WEIGHTS.contact, gate: GATES.contact, reasons: score.reasons.contact, pass: score.gates.contact.pass },
        { key: 'fit', label: 'Fit', value: score.fit, weight: WEIGHTS.fit, gate: null, reasons: score.reasons.fit, pass: true },
      ] as const)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/leads" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Leads
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{company.name ?? company.domain}</h1>
            <p className="text-sm text-muted-foreground">
              {isUrl ? (
                <a href={`https://${company.domain}`} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:underline">
                  {company.domain}
                </a>
              ) : (
                company.domain
              )}{' '}
              · {segmentLabel(company.segment)}
              {company.subCategory ? ` · ${company.subCategory}` : ''} · <span className="font-medium text-foreground">{STATUS_LABELS[company.status] ?? company.status}</span>
            </p>
          </div>
          <DetailActions id={company.id} status={company.status} />
        </div>
      </div>

      {company.failReasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Why it did not qualify</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {company.failReasons.map((r) => (
                <li key={r.code} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{failLabel(r.code)}</span>
                  <span className="font-mono text-xs leading-5 text-muted-foreground">{r.code}</span>
                  <span className="w-full text-muted-foreground sm:w-auto">{r.detail}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Score</CardTitle>
          </CardHeader>
          <CardContent>
            {!score ? (
              <p className="text-sm text-muted-foreground">Not scored yet. The lead is still being enriched.</p>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-semibold tabular-nums">{score.priority}</span>
                  <span className="text-sm text-muted-foreground">
                    priority · weights {score.weightsVersion} · rules v{score.rulesVersion}
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {subScores.map((s) => (
                    <div key={s.key} className="rounded-lg border p-3">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">{s.label}</span>
                        <span className="text-xs text-muted-foreground">weight {Math.round(s.weight * 100)}%</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span className="text-2xl font-semibold tabular-nums">{s.value}</span>
                        {s.gate !== null && <span className={s.pass ? 'text-xs text-muted-foreground' : 'text-xs font-medium text-destructive'}>{s.pass ? `passes gate ≥ ${s.gate}` : `fails gate ≥ ${s.gate}`}</span>}
                      </div>
                      <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {s.reasons.map((reason, i) => (
                          <li key={i}>{reason}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Country">{company.country}</Fact>
              <Fact label="City">{company.city}</Fact>
              <Fact label="Region">{company.region}</Fact>
              <Fact label="Timezone">{company.timezone}</Fact>
              <Fact label="Language">{company.language}</Fact>
              <Fact label="Compliance">{company.complianceRegime}</Fact>
              <Fact label="Source">{company.source}</Fact>
              <Fact label="Found">{company.createdAt.toISOString().slice(0, 10)}</Fact>
            </dl>
            {company.whyCandidate && <p className="mt-4 text-sm text-muted-foreground">{company.whyCandidate}</p>}
            {company.notes && <p className="mt-2 text-sm">{company.notes}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contacts</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactsEditor companyId={company.id} contacts={contacts.map((c) => ({ id: c.id, email: c.email, name: c.name, role: c.role, contactType: c.contactType, mxOk: c.mxOk, isPrimary: c.isPrimary, manual: c.manual, foundOnUrl: c.foundOnUrl }))} />
        </CardContent>
      </Card>

      {signal && (
        <>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Performance and platform</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Fact label="PSI mobile">
                    <PsiValue value={signal.psiMobile} />
                  </Fact>
                  <Fact label="PSI desktop">
                    <PsiValue value={signal.psiDesktop} />
                  </Fact>
                  <Fact label="LCP mobile">{signal.lcpMsMobile !== null ? `${(signal.lcpMsMobile / 1000).toFixed(1)} s` : null}</Fact>
                  <Fact label="HTTP status">{signal.httpStatus}</Fact>
                  <Fact label="Platform">{signal.platform}</Fact>
                  <Fact label="Design age">{signal.aiDesignCritique?.design_age.replace('_', ' ')}</Fact>
                  <Fact label="Agency grade">{yesNo(signal.aiDesignCritique?.agency_grade)}</Fact>
                  <Fact label="Sells abroad">{yesNo(signal.sellsAbroad)}</Fact>
                  <Fact label="English">{yesNo(signal.hasEnglish)}</Fact>
                  <Fact label="Multi-currency">{yesNo(signal.hasMulticurrency)}</Fact>
                  <Fact label="Booking or enquiry">{yesNo(signal.hasBookingOrEnquiry)}</Fact>
                  <Fact label="Contact form">{yesNo(signal.hasContactForm)}</Fact>
                </dl>
                {signal.tech.length > 0 && <p className="mt-4 text-xs text-muted-foreground">{signal.tech.map((t) => t.name).join(' · ')}</p>}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Summary and weaknesses</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {signal.aiSummary ? <p className="text-sm">{signal.aiSummary}</p> : <p className="text-sm text-muted-foreground">No summary. The site was not read.</p>}
                {signal.weaknesses.length > 0 && (
                  <ul className="flex flex-col gap-2 text-sm">
                    {signal.weaknesses.map((w) => (
                      <li key={w.code}>
                        <span className="font-mono text-xs text-muted-foreground">{w.code}</span>
                        <span className="block">{w.evidence}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {signal.paySignals && signal.paySignals.evidence.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground">Pay signals</h3>
                    <p className="text-sm">{signal.paySignals.evidence.join(' · ')}</p>
                  </div>
                )}
                {signal.majorBrand?.is_major && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground">Major brand check</h3>
                    <p className="text-sm">
                      {signal.majorBrand.type ?? 'unknown type'}, {signal.majorBrand.confidence} confidence: {signal.majorBrand.evidence}
                    </p>
                  </div>
                )}
                {signal.errors.length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-destructive">Steps that failed during enrichment</h3>
                    <ul className="text-sm">
                      {signal.errors.map((e, i) => (
                        <li key={i}>
                          <span className="font-mono text-xs">{e.step}</span>: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {(signal.screenshotDesktopPath || signal.screenshotMobilePath) && (
            <Card>
              <CardHeader>
                <CardTitle>Screenshots</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-start gap-4 md:flex-row">
                  {signal.screenshotDesktopPath && (
                    // Served by an authenticated route from local disk, so next/image optimisation does not apply.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/screenshots/${signal.screenshotDesktopPath}`} alt={`Desktop view of ${company.domain}`} width={1440} height={900} className="h-auto min-w-0 flex-1 rounded-lg border" />
                  )}
                  {signal.screenshotMobilePath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/screenshots/${signal.screenshotMobilePath}`} alt={`Mobile view of ${company.domain}`} width={390} height={844} className="h-auto w-56 shrink-0 rounded-lg border" />
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {labels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your decisions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {labels.map((l) => (
                <li key={l.id}>
                  <span className="font-medium capitalize">{l.decision}</span> <span className="text-muted-foreground">on {l.createdAt.toISOString().slice(0, 10)}</span>
                  {l.reasonCode && <span> · reason {l.reasonCode}</span>}
                  {l.overriddenCodes.length > 0 && <span> · overrode {l.overriddenCodes.join(', ')}</span>}
                  {l.note && <span className="block text-muted-foreground">{l.note}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
