import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "../assets");
const shotDir = join(root, "../screenshots");
mkdirSync(outDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

const ids = [
  "welcome",
  "home",
  "injury",
  "decisions",
  "momentum",
  "story",
];
const names = {
  welcome: "welcome.png",
  home: "home.png",
  injury: "injury-player.png",
  decisions: "decisions-leaderboard.png",
  momentum: "momentum-replay.png",
  story: "story-mode.png",
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:5179/", { waitUntil: "networkidle" });

for (const id of ids) {
  const file = names[id];
  const el = page.locator(`#${id}`);
  await el.scrollIntoViewIfNeeded();
  await el.screenshot({ path: join(outDir, file), type: "png" });
  await el.screenshot({ path: join(shotDir, file), type: "png" });
  console.log("saved", file);
}

await browser.close();
