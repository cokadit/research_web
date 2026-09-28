import { registrableDomain } from '../discovery/domain';

/**
 * Registrable domains that are always auto-excluded. Extend freely.
 * A match on the registrable domain also covers subdomains (bali.marriott.com).
 */
export const MAJOR_BRAND_DOMAINS: Record<string, string> = {
  // International hotel chains
  'marriott.com': 'Marriott',
  'ritzcarlton.com': 'Marriott',
  'starwoodhotels.com': 'Marriott',
  'accor.com': 'Accor',
  'all.accor.com': 'Accor',
  'novotel.com': 'Accor',
  'ibis.com': 'Accor',
  'sofitel.com': 'Accor',
  'fairmont.com': 'Accor',
  'hilton.com': 'Hilton',
  'ihg.com': 'IHG',
  'hyatt.com': 'Hyatt',
  'wyndhamhotels.com': 'Wyndham',
  'archipelagointernational.com': 'Archipelago',
  'astonhotelsinternational.com': 'Archipelago',
  'fourseasons.com': 'Four Seasons',
  'shangri-la.com': 'Shangri-La',
  'mandarinoriental.com': 'Mandarin Oriental',
  'radissonhotels.com': 'Radisson',
  'bestwestern.com': 'Best Western',
  'swiss-belhotel.com': 'Swiss-Belhotel',
  'santika.com': 'Santika',
  'banyantree.com': 'Banyan Tree',
  'aman.com': 'Aman',
  'sixsenses.com': 'IHG',
  'melia.com': 'Meliá',
  'kempinski.com': 'Kempinski',
  'minorhotels.com': 'Minor Hotels',
  'anantara.com': 'Minor Hotels',
  'oyorooms.com': 'OYO',
  'reddoorz.com': 'RedDoorz',

  // Fashion groups and well-known brands
  'lvmh.com': 'LVMH',
  'louisvuitton.com': 'LVMH',
  'dior.com': 'LVMH',
  'kering.com': 'Kering',
  'gucci.com': 'Kering',
  'inditex.com': 'Inditex',
  'zara.com': 'Inditex',
  'hm.com': 'H&M',
  'uniqlo.com': 'Fast Retailing',
  'nike.com': 'Nike',
  'adidas.com': 'Adidas',
  'adidas.co.id': 'Adidas',
  'puma.com': 'Puma',
  'gap.com': 'Gap',
  'levi.com': 'Levi Strauss',
  'ralphlauren.com': 'Ralph Lauren',
  'burberry.com': 'Burberry',
  'prada.com': 'Prada',
  'hermes.com': 'Hermès',
  'chanel.com': 'Chanel',
  'shein.com': 'Shein',
  'asos.com': 'ASOS',
  'zalora.co.id': 'Zalora',
  'zalora.com': 'Zalora',
  'matahari.com': 'Matahari',
  'pandora.net': 'Pandora',
  'swarovski.com': 'Swarovski',
  'tiffany.com': 'LVMH',

  // Furniture and home groups
  'ikea.com': 'IKEA',
  'ikea.co.id': 'IKEA',
  'ashleyfurniture.com': 'Ashley',
  'wayfair.com': 'Wayfair',
  'westelm.com': 'Williams-Sonoma',
  'potterybarn.com': 'Williams-Sonoma',
  'williams-sonoma.com': 'Williams-Sonoma',
  'rh.com': 'RH',
  'crateandbarrel.com': 'Crate & Barrel',
  'cb2.com': 'Crate & Barrel',
  'hermanmiller.com': 'MillerKnoll',
  'knoll.com': 'MillerKnoll',
  'steelcase.com': 'Steelcase',
  'la-z-boy.com': 'La-Z-Boy',
  'informa.co.id': 'Kawan Lama',
  'acehardware.co.id': 'Kawan Lama',
  'ruparupa.com': 'Kawan Lama',
  'fabelio.com': 'Fabelio',
  'dekoruma.com': 'Dekoruma',
  'boconcept.com': 'BoConcept',
  'natuzzi.com': 'Natuzzi',
  'roche-bobois.com': 'Roche Bobois',
  'kartell.com': 'Kartell',
  'vitra.com': 'Vitra',
};

/** Returns the group name when the domain is blocklisted, otherwise null. */
export function blocklistedBrand(domain: string): string | null {
  const host = domain.toLowerCase().split('/')[0].replace(/^www\./, '');
  if (MAJOR_BRAND_DOMAINS[host]) return MAJOR_BRAND_DOMAINS[host];
  const reg = registrableDomain(host);
  return reg ? (MAJOR_BRAND_DOMAINS[reg] ?? null) : null;
}
