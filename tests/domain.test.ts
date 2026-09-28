import { describe, expect, it } from 'vitest';
import { isMarketplaceUrl, isNoCrawlHost, normaliseCandidate, normaliseDomain, registrableDomain } from '../src/lib/discovery/domain';

describe('normaliseDomain', () => {
  it.each([
    ['https://www.Brand.com/about?x=1#top', 'brand.com'],
    ['HTTP://WWW.BRAND.CO.ID', 'brand.co.id'],
    ['brand.com', 'brand.com'],
    ['  www.brand.com/  ', 'brand.com'],
    ['https://brand.com:8080/path', 'brand.com'],
    ['https://shop.brand.com.au/collections', 'shop.brand.com.au'],
    ['//brand.com/x', 'brand.com'],
    ['https://brand.myshopify.com', 'brand.myshopify.com'],
  ])('%s → %s', (input, expected) => {
    expect(normaliseDomain(input)).toBe(expected);
  });

  it.each(['', '   ', 'not a url', 'localhost', 'http://192.168.1.10/', 'brand', 'https://brand.invalidtldxyz'])('rejects %j', (input) => {
    expect(normaliseDomain(input)).toBeNull();
  });
});

describe('registrableDomain', () => {
  it('handles multi-part public suffixes', () => {
    expect(registrableDomain('https://shop.brand.co.id/x')).toBe('brand.co.id');
    expect(registrableDomain('www.brand.com.au')).toBe('brand.com.au');
    expect(registrableDomain('brand.co.uk')).toBe('brand.co.uk');
  });
});

describe('no-crawl hosts', () => {
  it('blocks social networks, marketplaces and OTAs', () => {
    for (const url of ['https://www.instagram.com/brand', 'https://shopee.co.id/brand', 'https://shopee.ph/x', 'https://www.tokopedia.com/brand', 'https://www.etsy.com/shop/brand', 'https://www.airbnb.com/rooms/1', 'https://www.booking.com/hotel/x']) {
      expect(isNoCrawlHost(url)).toBe(true);
    }
    expect(isNoCrawlHost('https://brand.com')).toBe(false);
  });

  it('detects marketplace stores', () => {
    expect(isMarketplaceUrl('https://www.etsy.com/shop/brand')).toBe(true);
    expect(isMarketplaceUrl('https://shopee.co.id/brand')).toBe(true);
    expect(isMarketplaceUrl('https://www.instagram.com/brand')).toBe(false);
  });
});

describe('normaliseCandidate', () => {
  it('uses the host for a normal site', () => {
    expect(normaliseCandidate('https://www.brand.com/contact')).toEqual({ domain: 'brand.com', registrable: 'brand.com', noCrawl: false });
  });
  it('keeps the handle for a no-crawl host', () => {
    expect(normaliseCandidate('https://www.instagram.com/@Brand.Bali/?hl=en')).toEqual({
      domain: 'instagram.com/brand.bali',
      registrable: 'instagram.com',
      noCrawl: true,
    });
  });
  it('rejects a no-crawl host without a handle', () => {
    expect(normaliseCandidate('https://www.instagram.com/')).toBeNull();
  });
});
