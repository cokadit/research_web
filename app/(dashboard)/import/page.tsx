import type { Metadata } from 'next';
import { CsvImport, QuickAdd } from '@/components/import-forms';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Import' };

export default function ImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Import</h1>
        <p className="text-sm text-muted-foreground">Add leads from exhibitor lists, Deep Research output or your own finds.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick add</CardTitle>
          <CardDescription>
            One brand at a time. An Instagram or marketplace link is saved as a lead but never crawled. It lands in Not qualified as “Marketplace only”.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuickAdd />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV upload</CardTitle>
          <CardDescription>
            First row must be the header <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">name,website,segment,country,source,notes</code>. Segment is one of villa_developer, fashion, furniture, hotel,
            real_estate_agency. Source is one of exhibitor, deep_research, manual, and defaults to manual. Country is a two-letter code. Up to 4 MB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CsvImport />
        </CardContent>
      </Card>
    </div>
  );
}
