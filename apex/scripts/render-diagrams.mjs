/**
 * Renders docs/images/*.svg → docs/images/*.png at 2x scale using the
 * Playwright-managed Chromium already present in this project (no new deps).
 *
 * Usage: node scripts/render-diagrams.mjs
 */
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';

const CHROME = 'C:\\Users\\Bhuwan\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const IMG_DIR = resolve(import.meta.dirname, '..', '..', 'docs', 'images');
const SCALE = 2;

const names = ['architecture.svg', 'data-flow.svg', 'modules.svg'];

const browser = await chromium.launch({ headless: true, executablePath: CHROME });
for (const name of names) {
  const svgPath = join(IMG_DIR, name);
  const svg = readFileSync(svgPath, 'utf8');
  const w = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 1200);
  const h = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 600);
  const page = await browser.newPage({ viewport: { width: w * SCALE, height: h * SCALE }, deviceScaleFactor: SCALE });
  await page.setContent(
    `<html><body style="margin:0;background:#0f1224"><div id="t">${svg}</div></body></html>`
  );
  const el = page.locator('#t svg');
  const pngPath = join(IMG_DIR, name.replace('.svg', '.png'));
  await el.screenshot({ path: pngPath, scale: 'css' });
  const bytes = readFileSync(pngPath).length;
  console.log(`${name} → ${basename(pngPath)} (${w}x${h}, ${(bytes / 1024).toFixed(0)} KB)`);
  await page.close();
}
await browser.close();
console.log('done');
