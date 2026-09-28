import { describe, expect, it } from 'vitest';
import { classifyContactType, deobfuscate, extractContacts, extractEmailsFromText, extractSchemaOrgContacts, hasContactForm } from '../src/lib/enrich/contacts';

describe('extractEmailsFromText', () => {
  it('finds plain addresses and lowercases them', () => {
    expect(extractEmailsFromText('Write to Hello@Brand.co.id or sales@brand.co.id.')).toEqual(['hello@brand.co.id', 'sales@brand.co.id']);
  });
  it('removes duplicates', () => {
    expect(extractEmailsFromText('a@brand.com A@brand.com')).toEqual(['a@brand.com']);
  });
  it.each([
    ['hello [at] brand [dot] com', 'hello@brand.com'],
    ['hello(at)brand(dot)com', 'hello@brand.com'],
    ['hello {at} brand {dot} co {dot} id', 'hello@brand.co.id'],
    ['hello at brand dot com', 'hello@brand.com'],
    ['hello&#64;brand&#46;com', 'hello@brand.com'],
    ['hello&#x40;brand.com', 'hello@brand.com'],
    ['hello@brand dot com', 'hello@brand.com'],
  ])('deobfuscates %j', (input, expected) => {
    expect(extractEmailsFromText(input)).toEqual([expected]);
  });
  it('does not join ordinary sentences', () => {
    expect(extractEmailsFromText('Meet us at booth 12, dot matrix printers welcome')).toEqual([]);
    expect(deobfuscate('look at this')).toBe('look at this');
  });
  it('ignores image names, placeholders and system addresses', () => {
    const text = 'logo@2x.png hero@3x.webp you@example.com noreply@brand.com 0123456789abcdef0123456789abcdef@sentry.io name@domain.com';
    expect(extractEmailsFromText(text)).toEqual([]);
  });
});

describe('classifyContactType', () => {
  it.each([
    ['info@brand.com', 'generic'],
    ['hello@brand.com', 'generic'],
    ['customer.service@brand.com', 'generic'],
    ['sales@brand.com', 'role'],
    ['marketing@brand.com', 'role'],
    ['sales.bali@brand.com', 'role'],
    ['wholesale@brand.com', 'role'],
    ['made.wirawan@brand.com', 'named'],
    ['sarah@brand.com', 'named'],
  ])('%s → %s', (email, type) => {
    expect(classifyContactType(email, 'brand.com')).toBe(type);
  });
  it('treats a brand-named freemail inbox as generic', () => {
    expect(classifyContactType('tekukurbali@gmail.com', 'tekukur-bali.com')).toBe('generic');
    expect(classifyContactType('brand.official@gmail.com', 'brand.com')).toBe('generic');
  });
  it('treats a personal freemail address as named', () => {
    expect(classifyContactType('ketut.sari@gmail.com', 'brand.com')).toBe('named');
  });
});

describe('extractSchemaOrgContacts', () => {
  it('reads Organization and nested Person emails', () => {
    const html = `<script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"LocalBusiness","name":"Brand","email":"mailto:studio@brand.com",
         "founder":{"@type":"Person","name":"Ayu Lestari","jobTitle":"Founder","email":"ayu@brand.com"}}
      ]}</script>`;
    expect(extractSchemaOrgContacts(html)).toEqual([
      { email: 'studio@brand.com', name: null, role: null },
      { email: 'ayu@brand.com', name: 'Ayu Lestari', role: 'Founder' },
    ]);
  });
  it('survives malformed JSON-LD', () => {
    expect(extractSchemaOrgContacts('<script type="application/ld+json">{ not json </script>')).toEqual([]);
  });
});

describe('hasContactForm', () => {
  it('detects an enquiry form', () => {
    expect(hasContactForm('<form><input name="name"><input type="email" name="email"><textarea name="message"></textarea></form>')).toBe(true);
  });
  it('ignores search and newsletter forms', () => {
    expect(hasContactForm('<form><input type="search" name="q"></form>')).toBe(false);
    expect(hasContactForm('<form class="newsletter"><input type="email" name="email"><button>Subscribe</button></form>')).toBe(false);
  });
});

describe('extractContacts', () => {
  const html = `
    <html><head>
      <style>.a{background:url(bg@2x.png)}</style>
      <script>var cfg = {dsn: "abc@sentry.io"}; var e = "hidden@brand.com";</script>
      <script type="application/ld+json">{"@type":"Person","name":"Ayu Lestari","jobTitle":"Owner","email":"ayu@brand.com"}</script>
    </head><body>
      <a href="mailto:Sales@Brand.com?subject=Hi">Email us</a>
      <footer>General: info [at] brand [dot] com · ayu@brand.com</footer>
    </body></html>`;

  it('merges sources, keeps names and records the page', () => {
    const contacts = extractContacts(html, 'https://brand.com/contact', 'brand.com');
    expect(contacts).toEqual([
      { email: 'ayu@brand.com', name: 'Ayu Lestari', role: 'Owner', contactType: 'named', foundOnUrl: 'https://brand.com/contact' },
      { email: 'sales@brand.com', name: null, role: null, contactType: 'role', foundOnUrl: 'https://brand.com/contact' },
      { email: 'info@brand.com', name: null, role: null, contactType: 'generic', foundOnUrl: 'https://brand.com/contact' },
    ]);
  });
});
