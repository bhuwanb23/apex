import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const map = {
  "01-brand-open.html": "3.84",
  "02-promise.html": "7.573",
  "03-meet-aqx.html": "5.632",
  "04-injury.html": "6.613",
  "05-decisions.html": "6.272",
  "06-momentum.html": "5.653",
  "07-close.html": "5.504",
};

const dir = "compositions/frames";
for (const [file, dur] of Object.entries(map)) {
  const path = join(dir, file);
  let html = readFileSync(path, "utf8");
  html = html.replace(/data-duration="[0-9.]+"/g, `data-duration="${dur}"`);
  writeFileSync(path, html);
  console.log(file, dur);
}
