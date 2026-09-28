import { resolveMx } from 'node:dns/promises';

const cache = new Map<string, Promise<boolean>>();

async function lookup(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain);
    // A single "." exchange is a null MX (RFC 7505): the domain accepts no mail.
    return records.some((r) => r.exchange && r.exchange !== '.');
  } catch {
    return false;
  }
}

/** DNS MX lookup only. No SMTP connection is ever opened. */
export function hasMx(emailOrDomain: string): Promise<boolean> {
  const domain = emailOrDomain.includes('@') ? emailOrDomain.split('@')[1] : emailOrDomain;
  const key = domain.toLowerCase();
  let result = cache.get(key);
  if (!result) {
    result = lookup(key);
    cache.set(key, result);
  }
  return result;
}
