import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = dirname(fileURLToPath(import.meta.url));
const svgDir = join(root, "svg");
const pngDir = join(root, "png");
mkdirSync(pngDir, { recursive: true });

const files = readdirSync(svgDir).filter((f) => f.endsWith(".svg"));
for (const file of files) {
  let svg = readFileSync(join(svgDir, file), "utf8");
  if (svg.charCodeAt(0) === 0xfeff) svg = svg.slice(1);
  const resvg = new Resvg(Buffer.from(svg, "utf8"), {
    fitTo: { mode: "zoom", value: 2 },
    font: { loadSystemFonts: true },
  });
  const png = resvg.render().asPng();
  const out = join(pngDir, file.replace(/\.svg$/, ".png"));
  writeFileSync(out, png);
  console.log("wrote", out, png.length);
}
