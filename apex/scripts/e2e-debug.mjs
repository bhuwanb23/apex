import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const candidates = [
  'C:\\Users\\Bhuwan\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const exe = candidates.find(p => existsSync(p));
const b = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
const ctx = await b.newContext();
const page = await ctx.newPage();
await page.addInitScript(() => {
  if (!sessionStorage.getItem('cleared')) {
    sessionStorage.setItem('cleared', '1');
    localStorage.clear();
  }
});
await page.goto('http://localhost:8081/', { waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(3000);
await page.getByText('Use demo account', { exact: true }).click();
await page.getByText('Sign in', { exact: true }).click();
await page.waitForTimeout(2500);
await page.getByText('Already set up? Skip', { exact: true }).click();
await page.waitForTimeout(4000);

const probe = await page.evaluate(() => {
  // Find leaf elements with single glyph text and get codepoint + bounding rect.
  const els = [...document.querySelectorAll('*')];
  const leaves = els.filter(el => {
    const t = (el.textContent ?? '');
    return t.length === 1 && el.children.length === 0 && t.charCodeAt(0) > 0xE000;
  });
  return leaves.slice(0, 12).map(el => {
    const r = el.getBoundingClientRect();
    return { glyph: el.textContent, code: 'U+' + el.textContent.charCodeAt(0).toString(16).toUpperCase(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
});
console.log(JSON.stringify(probe, null, 2));
await b.close();
