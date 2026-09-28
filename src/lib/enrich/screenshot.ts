import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { env } from '../../config/env';
import { SCREENSHOTS } from '../../config/limits';

export async function toWebp(png: Buffer): Promise<Buffer> {
  return sharp(png).webp({ quality: SCREENSHOTS.webpQuality }).toBuffer();
}

export function screenshotRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), env().SCREENSHOT_DIR);
}

/** Saves under SCREENSHOT_DIR/<companyId>/ and returns the path relative to SCREENSHOT_DIR, with forward slashes. */
export async function saveScreenshot(companyId: string, kind: 'desktop' | 'mobile', webp: Buffer): Promise<string> {
  const dir = path.join(/*turbopackIgnore: true*/ screenshotRoot(), companyId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, `${kind}.webp`), webp);
  return `${companyId}/${kind}.webp`;
}

/** Placeholder image for mock mode. */
export async function placeholderWebp(kind: 'desktop' | 'mobile', label: string): Promise<Buffer> {
  const { width, height } = SCREENSHOTS[kind];
  const safe = label.replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e7e5e4"/><text x="50%" y="50%" font-family="sans-serif" font-size="${kind === 'desktop' ? 40 : 22}" fill="#57534e" text-anchor="middle">${safe} (fixture)</text></svg>`;
  return sharp(Buffer.from(svg)).webp({ quality: 60 }).toBuffer();
}
