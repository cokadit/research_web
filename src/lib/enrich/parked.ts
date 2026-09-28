const PARKED_TEXT = [
  /this domain (name )?(is|may be) for sale/i,
  /buy this domain/i,
  /domain (is )?parked/i,
  /parked (free|domain)/i,
  /the domain .{1,80} is for sale/i,
  /inquire about this domain/i,
  /this (web ?site|domain) (has expired|is expired)/i,
  /domain (has )?expired/i,
  /account (has been )?suspended/i,
  /this site can.t be reached/i,
  /website (is )?(coming soon|under construction)/i,
  /future home of something quite cool/i,
  /related searches/i,
];

const PARKED_HOSTS = /(sedoparking|sedo\.com|hugedomains\.com|dan\.com|afternic\.com|bodis\.com|parkingcrew|above\.com|domainmarket\.com|undeveloped\.com|namebright\.com|godaddy\.com\/forsale|parklogic)/i;

export interface ParkedVerdict {
  parked: boolean;
  detail: string;
}

/** A page counts as parked when it is a registrar or parking page, or is nearly empty and says so. */
export function detectParked(input: { html: string; text: string; finalUrl: string }): ParkedVerdict {
  if (PARKED_HOSTS.test(input.finalUrl)) return { parked: true, detail: `redirects to parking service ${new URL(input.finalUrl).host}` };

  const hostMatch = input.html.match(PARKED_HOSTS);
  const words = input.text.trim().split(/\s+/).filter(Boolean).length;
  const textMatch = PARKED_TEXT.find((p) => p.test(input.text));

  // A real shop can mention "coming soon" somewhere. Only short pages are judged by text.
  if (textMatch && words < 150) return { parked: true, detail: `page says "${input.text.match(textMatch)?.[0]}"` };
  if (hostMatch && words < 150) return { parked: true, detail: `parking script from ${hostMatch[0]}` };
  if (words < 5 && !/<img|<video|<canvas|<svg/i.test(input.html)) return { parked: true, detail: 'page is empty' };
  return { parked: false, detail: '' };
}
