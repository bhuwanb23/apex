import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const meta = JSON.parse(readFileSync("audio_meta.json", "utf8"));
if (existsSync("assets/bgm/track.wav")) {
  meta.bgm = { path: "assets/bgm/track.wav", volume: 0.14, mode: "generate", duration_s: 65 };
  meta.bgm_pending = false;
}
writeFileSync("audio_meta.json", JSON.stringify(meta, null, 2));

const map = {
  "01-brand.html": String(meta.voices[0].duration_s),
  "02-noise.html": String(meta.voices[1].duration_s),
  "03-brief.html": String(meta.voices[2].duration_s),
  "04-injury.html": String(meta.voices[3].duration_s),
  "05-decisions.html": String(meta.voices[4].duration_s),
  "06-momentum.html": String(meta.voices[5].duration_s),
  "07-close.html": String(meta.voices[6].duration_s),
};

for (const [file, dur] of Object.entries(map)) {
  const path = join("compositions/frames", file);
  let html = readFileSync(path, "utf8");
  html = html.replace(/data-duration="[0-9.]+"/g, `data-duration="${dur}"`);
  writeFileSync(path, html);
  console.log(file, dur);
}
console.log("bgm", meta.bgm?.path, "total", meta.voices.reduce((a, v) => a + v.duration_s, 0));
