import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const outDir = join(root, "renders");
mkdirSync(outDir, { recursive: true });

const segments = [
  { img: "snapshots/frame-00-at-2s.png", voice: "assets/voice/01.wav", dur: 3.84 },
  { img: "snapshots/frame-01-at-8s.png", voice: "assets/voice/02.wav", dur: 7.573 },
  { img: "snapshots/frame-02-at-14s.png", voice: "assets/voice/03.wav", dur: 5.632 },
  { img: "snapshots/frame-03-at-20s.png", voice: "assets/voice/04.wav", dur: 6.613 },
  { img: "snapshots/frame-04-at-27s.png", voice: "assets/voice/05.wav", dur: 6.272 },
  { img: "snapshots/frame-05-at-33s.png", voice: "assets/voice/06.wav", dur: 5.653 },
  { img: "snapshots/frame-06-at-38s.png", voice: "assets/voice/07.wav", dur: 5.504 },
];

for (const s of segments) {
  if (!existsSync(s.img)) throw new Error(`missing ${s.img}`);
  if (!existsSync(s.voice)) throw new Error(`missing ${s.voice}`);
}

const listPath = join(outDir, "segments.txt");
const segFiles = [];
segments.forEach((s, i) => {
  const seg = join(outDir, `seg-${String(i + 1).padStart(2, "0")}.mp4`);
  const cmd = [
    "ffmpeg -y",
    `-loop 1 -t ${s.dur} -i "${s.img}"`,
    `-i "${s.voice}"`,
    `-c:v libx264 -tune stillimage -pix_fmt yuv420p -r 30`,
    `-c:a aac -b:a 192k -shortest`,
    `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2"`,
    `"${seg}"`,
  ].join(" ");
  console.log("encoding", seg);
  execSync(cmd, { stdio: "inherit" });
  segFiles.push(seg);
});

writeFileSync(listPath, segFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
const silent = join(outDir, "video-silent-voice.mp4");
execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${silent}"`, { stdio: "inherit" });

const finalOut = join(outDir, "video.mp4");
const bgm = "assets/bgm/track.wav";
execSync(
  [
    "ffmpeg -y",
    `-i "${silent}"`,
    `-stream_loop -1 -i "${bgm}"`,
    `-filter_complex "[1:a]volume=0.14,afade=t=in:st=0:d=1.2,afade=t=out:st=38:d=3[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"`,
    `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k -shortest`,
    `"${finalOut}"`,
  ].join(" "),
  { stdio: "inherit" },
);

console.log("wrote", finalOut);
