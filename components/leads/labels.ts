export const FAIL_LABELS: Record<string, string> = {
  major_brand: 'Major brand',
  dead_site: 'Dead site',
  parked_site: 'Parked',
  duplicate: 'Duplicate',
  suppressed: 'Suppressed',
  major_brand_uncertain: 'Maybe major brand',
  brand_group: 'Brand group',
  site_already_good: 'Site already good',
  no_contact: 'No contact',
  gate_need: 'Need < gate',
  gate_contact: 'Contact < gate',
  marketplace_only: 'Marketplace only',
  robots_blocked: 'Robots blocked',
  wrong_segment: 'Wrong segment',
  enrich_incomplete: 'Enrichment incomplete',
};

export function failLabel(code: string): string {
  return FAIL_LABELS[code] ?? (code.startsWith('rule:') ? `Rule ${code.slice(5, 13)}` : code);
}

const SEGMENT_LABELS: Record<string, string> = { villa_developer: 'Villa developer', fashion: 'Fashion', furniture: 'Furniture', hotel: 'Hotel', real_estate_agency: 'Real estate agency' };
export const segmentLabel = (s: string) => SEGMENT_LABELS[s] ?? s;

const CONTACT_LABELS: Record<string, string> = { named: 'Named', role: 'Role', generic: 'Generic', form_only: 'Form only' };
export const contactLabel = (s: string | null) => (s ? (CONTACT_LABELS[s] ?? s) : 'None');
