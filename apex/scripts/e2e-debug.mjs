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
console.log('1. fresh URL:', page.url(), '| signIn:', await page.evaluate(() => document.body.innerText.includes('Sign in to your dashboard')));

await page.getByText('Use demo account', { exact: true }).click();
await page.getByText('Sign in', { exact: true }).click();
await page.waitForTimeout(3000);
console.log('2. after login URL:', page.url(), '| onboarding:', await page.evaluate(() => document.body.innerText.includes('Sports Intelligence')));

await page.getByText('Get started', { exact: true }).click();
await page.waitForTimeout(2000);
await page.getByText('Basketball', { exact: true }).first().click();
await page.getByText('Continue', { exact: true }).click();
await page.waitForTimeout(2000);
await page.getByText('Front Office Analyst', { exact: true }).click();
await page.getByText('Continue as Front Office Analyst', { exact: true }).click();
await page.waitForTimeout(5000);
console.log('5. after onboarding URL:', page.url(), '| home:', await page.evaluate(() => document.body.innerText.includes('Injury Watch')));

await page.reload({ waitUntil: 'networkidle', timeout: 90000 });
await page.waitForTimeout(4000);
console.log('6. reload URL:', page.url(), '| home:', await page.evaluate(() => document.body.innerText.includes('Injury Watch')), '| onboarding re-shown:', await page.evaluate(() => document.body.innerText.includes('Sports Intelligence')));

await b.close();
