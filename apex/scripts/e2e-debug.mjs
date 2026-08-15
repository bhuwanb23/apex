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

// Open Settings (gear glyph U+E8B8)
await page.getByText('\uE8B8', { exact: true }).first().click();
await page.waitForTimeout(2000);

// The Backend URL field should be present with the auto-detected value.
const urlInput = page.locator('input').filter({ has: page.locator('xpath=..') }).first();
const inputs = await page.evaluate(() => {
  const all = [...document.querySelectorAll('input')];
  return all.map(i => ({ placeholder: i.placeholder, value: i.value }));
});
console.log('inputs on settings:', JSON.stringify(inputs));

// Find the URL input (has http placeholder / url keyboard).
const urlField = page.locator('input[placeholder="http://192.168.1.50:8000"]');
const hasField = (await urlField.count()) > 0;
console.log('URL field present:', hasField);

// Change it to the LAN IP (what a demo would use) and save.
if (hasField) {
  await urlField.fill('http://192.168.31.67:8000');
  await page.getByText('Save', { exact: true }).click();
  await page.waitForTimeout(1500);
  const stored = await page.evaluate(() => localStorage.getItem('aqx.apiUrl.v1'));
  console.log('stored override:', stored);

  // Verify the app now pings the LAN IP backend.
  const reqs = [];
  page.on('request', r => { if (r.url().includes(':8000')) reqs.push(r.url()); });
  await page.getByText('Run health check', { exact: true }).click().catch(async () => {
    await page.getByText('System health', { exact: true }).click().catch(() => {});
  });
  await page.waitForTimeout(2000);
  console.log('health requests after save:', reqs.slice(0, 3));

  // Reset -> stored override cleared.
  await page.getByText('Reset', { exact: true }).click();
  await page.waitForTimeout(1000);
  const afterReset = await page.evaluate(() => localStorage.getItem('aqx.apiUrl.v1'));
  console.log('stored override after reset:', afterReset);
}
await b.close();
