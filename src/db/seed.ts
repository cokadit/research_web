import { and, eq } from 'drizzle-orm';
import { PLACES_MARKER } from '../lib/discovery/run';
import { SEED_PLACES_TEMPLATES, SEED_TEMPLATES } from '../lib/discovery/templates';
import { closeDb, db } from './client';
import { queryTemplates } from './schema';

async function main() {
  let added = 0;
  const all = [...SEED_TEMPLATES.map((t) => ({ ...t, places: false })), ...SEED_PLACES_TEMPLATES.map((t) => ({ ...t, places: true }))];
  for (const t of all) {
    const [existing] = await db
      .select({ id: queryTemplates.id })
      .from(queryTemplates)
      .where(and(eq(queryTemplates.segment, t.segment), eq(queryTemplates.template, t.template)));
    if (existing) continue;
    await db.insert(queryTemplates).values({ segment: t.segment, template: t.template, params: t.places ? { ...t.params, [PLACES_MARKER]: ['1'] } : t.params });
    added++;
  }
  console.log(`Seed done: ${added} template(s) added, ${all.length - added} already present.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
