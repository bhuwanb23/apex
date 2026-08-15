import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const voices = [];
for (let i = 1; i <= 7; i++) {
  const path = `assets/voice/0${i}.wav`;
  let dur = 0;
  try {
    const out = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 ${path}`, {
      encoding: "utf8",
    }).trim();
    dur = Number(out) || 0;
  } catch {}
  voices.push({ frame: i, path, duration_s: Number(dur.toFixed(3)), words: [] });
}

const total = Number(voices.reduce((a, v) => a + v.duration_s, 0).toFixed(3));
const meta = {
  bgm: { path: "assets/bgm/track.wav", volume: 0.12, mode: "generate", duration_s: 45 },
  bgm_pending: true,
  bgm_provider: "musicgen",
  bgm_pid: 25120,
  bgm_log: "D:\\projects\\apps\\apex\\videos\\aqx-promo\\assets\\bgm\\bgm-1786796397454.log",
  bgm_mode: "detached-seed-loop",
  bgm_target_duration_s: total,
  voices,
  sfx: [],
};

writeFileSync("audio_meta.json", JSON.stringify(meta, null, 2));
writeFileSync(
  "audio_engine_meta.json",
  JSON.stringify(
    {
      tts_provider: "kokoro",
      voice_id: "am_michael",
      ...meta,
      total_duration_s: total,
    },
    null,
    2,
  ),
);
console.log({ total, voices: voices.map((v) => v.duration_s) });
