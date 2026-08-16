/**
 * Level 7 — Testing The React Native App (Expo web build).
 *
 * Drives the real app (http://localhost:8081) against the real backend
 * (http://localhost:8000) in headless Chrome. Covers the plan's scenarios:
 *   1. Onboarding: fresh install -> auth login -> 3 onboarding screens -> Home
 *   2. Tab navigation: Injury / Decisions / Momentum without crashing
 *   3. Player drill-down + back
 *   4. Offline: backend blocked -> cached/demo data + banner, no crash/blank;
 *      restore -> refresh -> live data returns
 *   5. Search: tap search icon, type name, results appear, tap -> correct screen
 *   6. Story mode: loading -> readable paragraph; share button doesn't crash
 *   7. Role change: Analyst -> Fan hides stats; Fan -> Analyst shows them again
 *
 * Usage: node scripts/e2e-level7.mjs   (backend + expo web must already be up)
 */

import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const APP_URL = process.env.E2E_APP_URL ?? 'http://localhost:8081';

const CHROME_CANDIDATES = [
  // Playwright-managed Chromium (already downloaded in ms-playwright)
  'C:\\Users\\Bhuwan\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  'C:\\Users\\Bhuwan\\AppData\\Local\\ms-playwright\\chromium-1208\\chrome-win64\\chrome.exe',
  // System Chrome
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];

let passed = 0;
let failed = 0;
const failures = [];

function report(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Assert a text node is (or becomes) visible on the page. */
async function expectText(page, text, { timeout = 15000, exact = false } = {}) {
  try {
    const loc = exact ? page.getByText(text, { exact: true }) : page.getByText(text);
    await loc.first().waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** Tap the element containing exact text. */
async function tapText(page, text, { timeout = 15000 } = {}) {
  const loc = page.getByText(text, { exact: true }).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
}

function chromePath() {
  for (const p of CHROME_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return undefined; // let playwright resolve its own browser
}

let browser;
try {
  console.log('Launching headless Chrome…');
  browser = await chromium.launch({
    executablePath: chromePath(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
} catch (err) {
  console.error('FAIL could not launch Chrome:', err.message);
  process.exit(1);
}

/** Clear device storage on the FIRST page load only (so a reload mid-flow
 *  keeps the session — AsyncStorage -> localStorage on web). */
function freshInstallInitScript() {
  return () => {
    if (!sessionStorage.getItem('e2e-cleared')) {
      sessionStorage.setItem('e2e-cleared', '1');
      localStorage.clear();
    }
  };
}

// ===========================================================================
// 1. ONBOARDING — fresh install -> login -> 3 screens -> Home
// ===========================================================================
console.log('\n=== 1. Onboarding flow ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Wait for the splash overlay to fade (650ms + callback) and the auth screen.
  const authVisible = await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  report('fresh install shows auth screen (splash clears)', authVisible);
  if (!authVisible) {
    const body = await page.evaluate(() => document.body.innerText.slice(0, 300));
    console.log('    body:', JSON.stringify(body));
    await ctx.close();
    browser.close();
    process.exit(1);
  }

  // Demo account fill + sign in (mock auth).
  await page.getByText('Use demo account', { exact: true }).click();
  await expectText(page, 'demo@apex.app');
  await page.getByText('Sign in', { exact: true }).click();

  // Onboarding screen 1: Welcome.
  const welcome = await expectText(page, 'Sports Intelligence');
  report('onboarding screen 1 (welcome) after login', welcome);
  await tapText(page, 'Get started');

  // Onboarding screen 2: Sport select (cards show full names, not "NBA").
  const sportSelect = await expectText(page, 'Which sport do you follow?');
  report('onboarding screen 2 (sport select)', sportSelect);
  await page.getByText('Basketball', { exact: true }).first().click();
  await tapText(page, 'Continue');

  // Onboarding screen 3: Role select.
  const roleSelect = await expectText(page, 'How will you use Apex?');
  report('onboarding screen 3 (role select)', roleSelect);
  await page.getByText('Front Office Analyst', { exact: true }).click();
  await tapText(page, 'Continue as Front Office Analyst');

  // Home screen.
  const home = await expectText(page, 'Injury Watch', { timeout: 30000 });
  report('arrive at Home screen (tabs mounted)', home);
  await page.screenshot({ path: 'scripts/e2e-shots/01-home.png' });

  // Settings persists role: verify greeting mentions Analyst.
  const analystGreeting = await expectText(page, 'Analyst');
  report('Home greeting uses selected role (Analyst)', analystGreeting);

  // Onboarding shows only ONCE: reload -> straight to Home, no onboarding re-show.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const staysHome = await expectText(page, 'Injury Watch', { timeout: 30000 });
  const onboardingGone = !(await expectText(page, 'Sports Intelligence', { timeout: 5000 }));
  report('onboarding shows once (reload -> Home, not onboarding again)', staysHome && onboardingGone);

  await ctx.close();
}

// ===========================================================================
// 2. TAB NAVIGATION + PLAYER DRILL-DOWN
// ===========================================================================
console.log('\n=== 2. Tab navigation + player drill-down ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Fast path to Home: login -> skip onboarding (analyst default).
  await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  await page.getByText('Use demo account', { exact: true }).click();
  await page.getByText('Sign in', { exact: true }).click();
  await expectText(page, 'Sports Intelligence', { timeout: 20000 });
  await page.getByText('Already set up? Skip', { exact: true }).click();
  await expectText(page, 'Injury Watch', { timeout: 30000 });

  for (const [tab, marker] of [
    ['Injury', 'Risk distribution'],
    ['Decisions', 'Coach Leaderboard'],
    ['Momentum', 'Is momentum real?'],
  ]) {
    await page.getByText(tab, { exact: true }).last().click().catch(async () => {
      await page.getByText(tab, { exact: true }).first().click();
    });
    const ok = await expectText(page, marker, { timeout: 25000 });
    report(`tab "${tab}" navigates without crashing`, ok, `marker "${marker}"`);
  }

  // Back to Injury tab, then tap the first red-zone player row.
  await page.getByText('Injury', { exact: true }).last().click().catch(() => {});
  await expectText(page, 'Risk distribution', { timeout: 25000 });

  const header = page.getByText('Top red zone players').first();
  const playerClicked = await (async () => {
    try {
      await header.waitFor({ state: 'visible', timeout: 15000 });
      // The first player row card sits right under the header — click it.
      const headerBox = await header.boundingBox();
      if (!headerBox) return false;
      await page.mouse.click(headerBox.x + 200, headerBox.y + headerBox.height + 30);
      return true;
    } catch {
      return false;
    }
  })();
  report('tap player in injury list', playerClicked);

  const playerScreen = await expectText(page, 'Why the flag', { timeout: 20000 });
  report('player risk screen renders', playerScreen);
  await page.screenshot({ path: 'scripts/e2e-shots/02-player-risk.png' });

  // Back (browser back on web) -> returns to the list.
  await page.goBack().catch(() => {});
  const backToInjury = await expectText(page, 'Risk distribution', { timeout: 20000 });
  report('back returns to injury list', backToInjury);

  ctx.close();
}

// ===========================================================================
// 3. OFFLINE — blocked backend -> graceful banner + data, no crash
// ===========================================================================
console.log('\n=== 3. Offline resilience ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // Block ALL backend calls (simulates dead internet).
  await ctx.route('**://localhost:8000/**', route => route.abort());
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Login + skip onboarding quickly (demo account path: welcome -> skip).
  await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  await page.getByText('Use demo account', { exact: true }).click();
  await page.getByText('Sign in', { exact: true }).click();
  await expectText(page, 'Sports Intelligence', { timeout: 20000 });

  // Fresh install + offline: no device cache yet, so onboarding skip -> Home with demo fallback.
  await page.getByText('Already set up? Skip', { exact: true }).click();

  const offlineBanner = await expectText(page, 'You are offline. Showing last known data', { timeout: 30000 });
  report('offline banner shown when backend unreachable', offlineBanner);

  const homeRendered = await expectText(page, 'Injury Watch', { timeout: 20000 });
  report('home still renders demo/cached data (no blank screen, no crash)', homeRendered);
  await page.screenshot({ path: 'scripts/e2e-shots/03-offline.png' });

  // Restore the connection (unblock) — the backend retries every 30s, but the
  // banner is tappable to force an immediate health check.
  await ctx.unroute('**://localhost:8000/**');
  await page.getByText('Retry', { exact: true }).click().catch(() => {});
  const backOnline = await (async () => {
    // Banner disappears once health passes.
    try {
      await page.getByText('You are offline. Showing last known data').waitFor({ state: 'detached', timeout: 20000 });
      return true;
    } catch {
      return false;
    }
  })();
  report('banner disappears after connection restored + refresh', backOnline);
  await page.screenshot({ path: 'scripts/e2e-shots/04-back-online.png' });

  ctx.close();
}

// ===========================================================================
// 4. SEARCH — type name -> results -> tap navigates to correct screen
// ===========================================================================
console.log('\n=== 4. Search ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Fast path to Home: login -> skip onboarding (analyst default).
  await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  await page.getByText('Use demo account', { exact: true }).click();
  await page.getByText('Sign in', { exact: true }).click();
  await expectText(page, 'Sports Intelligence', { timeout: 20000 });
  await page.getByText('Already set up? Skip', { exact: true }).click();
  await expectText(page, 'Injury Watch', { timeout: 30000 });

  // Open search from the Home top bar — expo-symbols renders icons as
  // private-use glyphs on web (U+E8B6 = magnifyingglass).
  const searchIcon = page.getByText('\uE8B6', { exact: true }).first();
  await searchIcon.waitFor({ state: 'visible', timeout: 15000 });
  await searchIcon.click();
  const searchOpen = await expectText(page, 'Popular right now', { timeout: 15000 });
  report('search screen opens from Home', searchOpen);

  // Type a player name (min 2 chars before results fire).
  const started = Date.now();
  await page.getByPlaceholder('Search players, teams, coaches…').fill('Reynolds');
  await page.keyboard.press('Enter');
  const resultsVisible = await expectText(page, 'Players (', { timeout: 20000 });
  const elapsed = Date.now() - started;
  report('results appear after typing a name', resultsVisible, `${elapsed}ms`);

  await page.screenshot({ path: 'scripts/e2e-shots/05-search-results.png' });

  // Tap the first player result -> Player Risk screen.
  const firstResult = page.getByText('Bryan Reynolds', { exact: true }).first();
  const resultTap = await (async () => {
    try {
      await firstResult.waitFor({ state: 'visible', timeout: 15000 });
      await firstResult.click();
      return true;
    } catch {
      return false;
    }
  })();
  report('tap player result', resultTap);
  const detail = await expectText(page, 'Why the flag', { timeout: 20000 });
  report('navigates to player risk screen', detail);
  await page.screenshot({ path: 'scripts/e2e-shots/06-search-detail.png' });

  ctx.close();
}

// ===========================================================================
// 5. STORY MODE — loading -> readable paragraph; share doesn't crash
// ===========================================================================
console.log('\n=== 5. Story mode ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  await page.getByText('Use demo account', { exact: true }).click();
  await page.getByText('Sign in', { exact: true }).click();
  await expectText(page, 'Sports Intelligence', { timeout: 20000 });
  await page.getByText('Already set up? Skip', { exact: true }).click();
  await expectText(page, 'Injury Watch', { timeout: 30000 });

  // Story mode pill (bottom for non-fan roles — scroll to it).
  const storyBtn = page.getByText("📖 Tell me what's happening today").first();
  const storyOpened = await (async () => {
    try {
      await storyBtn.scrollIntoViewIfNeeded({ timeout: 15000 });
      await storyBtn.click();
      return true;
    } catch {
      return false;
    }
  })();
  report('story mode opens from Home', storyOpened);

  const storyHeadline = await expectText(page, 'Apex Story Mode', { timeout: 15000 });
  report('story modal renders', storyHeadline);

  // Paragraph should be a readable sentence (not empty / not an error).
  const paragraphText = await page.evaluate(() => {
    const els = [...document.querySelectorAll('div')].filter(d => d.children.length === 0);
    const long = els.find(d => (d.textContent ?? '').length > 120);
    return long?.textContent ?? '';
  });
  report('story paragraph is a readable multi-sentence text', paragraphText.length > 120, `${paragraphText.length} chars`);
  await page.screenshot({ path: 'scripts/e2e-shots/07-story.png' });

  // Share button — must not crash the app (native share sheet is a device feature).
  let shareOk = true;
  try {
    const shareBtn = page.getByText('Share story', { exact: true });
    await shareBtn.waitFor({ state: 'visible', timeout: 10000 });
    await shareBtn.click();
    await page.waitForTimeout(800);
  } catch {
    shareOk = false;
  }
  report('share button tappable without crashing', shareOk);
  const stillAlive = await expectText(page, 'Apex Story Mode', { timeout: 8000 });
  report('app still responsive after share tap', stillAlive);

  ctx.close();
}

// ===========================================================================
// 6. ROLE CHANGE — Analyst -> Fan hides stats; Fan -> Analyst restores
// ===========================================================================
console.log('\n=== 6. Role changes ===');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript(freshInstallInitScript());
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await expectText(page, 'Apex Sports Intelligence', { timeout: 30000 });
  await page.getByText('Use demo account', { exact: true }).click();
  await page.getByText('Sign in', { exact: true }).click();
  await expectText(page, 'Sports Intelligence', { timeout: 20000 });
  await page.getByText('Already set up? Skip', { exact: true }).click();
  await expectText(page, 'Injury Watch', { timeout: 30000 });

  // Change role: Settings -> Change role -> Fan -> Save. The gear icon is
  // the U+E8B8 glyph (expo-symbols) on web.
  await page.getByText('\uE8B8', { exact: true }).first().click();
  await expectText(page, 'Change role', { timeout: 15000 });
  await page.getByText('Change role', { exact: true }).click();
  await expectText(page, 'Role Preferences', { timeout: 15000 });
  await page.getByText('Fan / Journalist', { exact: true }).click();
  await page.getByText('Save changes', { exact: true }).click();
  // Close settings modal.
  await page.keyboard.press('Escape').catch(() => {});

  // Open Momentum tab -> stats should be hidden for Fan.
  await page.getByText('Momentum', { exact: true }).last().click().catch(() => {});
  const momentumShown = await expectText(page, 'Is momentum real?', { timeout: 25000 });
  report('momentum opens as Fan', momentumShown);

  const statsHiddenAsFan = await (async () => {
    try {
      await page.getByText('Hazard Coefficient', { exact: true }).waitFor({ state: 'detached', timeout: 8000 });
      return true;
    } catch {
      // Either detached already or never rendered — count as hidden if not visible.
      const visible = await page.getByText('Hazard Coefficient', { exact: true }).isVisible().catch(() => false);
      return !visible;
    }
  })();
  report('statistics section hidden for Fan role', statsHiddenAsFan);
  const plainTextShown = await expectText(page, 'In plain English', { timeout: 8000 });
  report('plain explanation still shown for Fan', plainTextShown);
  await page.screenshot({ path: 'scripts/e2e-shots/08-fan-momentum.png' });

  // Change back to Analyst -> stats visible again.
  await page.getByText('\uE8B8', { exact: true }).first().click();
  await expectText(page, 'Change role', { timeout: 15000 });
  await page.getByText('Change role', { exact: true }).click();
  await expectText(page, 'Role Preferences', { timeout: 15000 });
  await page.getByText('Front Office Analyst', { exact: true }).click();
  await page.getByText('Save changes', { exact: true }).click();
  await page.keyboard.press('Escape').catch(() => {});

  await page.getByText('Momentum', { exact: true }).last().click().catch(() => {});
  await expectText(page, 'Is momentum real?', { timeout: 25000 });
  const statsShownAsAnalyst = await expectText(page, 'Hazard Coefficient', { timeout: 10000 });
  report('statistics section visible again for Analyst role', statsShownAsAnalyst);
  await page.screenshot({ path: 'scripts/e2e-shots/09-analyst-momentum.png' });

  ctx.close();
}

await browser.close();

console.log(`\n========== RESULT: ${passed} passed, ${failed} failed ==========`);
if (failures.length > 0) {
  console.log('Failed:', failures.join(', '));
  process.exit(1);
}
