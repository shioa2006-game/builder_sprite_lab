// One-off asset tool: turn the chroma-green background of player_image.png into
// real alpha, with a mild de-spill on the anti-aliased edge pixels.
//   node tools/keygreen.mjs
import { readFileSync, writeFileSync } from "node:fs";
import pngjs from "pngjs";

const { PNG } = pngjs;

const SRC = "assets/player_image.png";
const OUT = "assets/player_body_8dir.png";

const png = PNG.sync.read(readFileSync(SRC));
const { width, height, data } = png;

let cleared = 0;
let despilled = 0;

for (let i = 0; i < data.length; i += 4) {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];

  // chroma background ~ (25, 218, 38): green clearly dominant and not yellow/cyan
  const greenDom = g - Math.max(r, b);
  const isBg = g > 140 && r < 130 && b < 130 && g - r > 30 && g - b > 30;

  if (isBg) {
    data[i + 3] = 0; // fully transparent
    cleared += 1;
  } else if (greenDom > 14 && g > 110) {
    // edge pixel with green spill: pull green down toward the next channel and
    // soften alpha a touch so no green halo remains around the sprite.
    data[i + 1] = Math.max(r, b) + Math.min(greenDom, 12);
    data[i + 3] = 200;
    despilled += 1;
  }
}

writeFileSync(OUT, PNG.sync.write(png));
console.log(`wrote ${OUT} (${width}x${height}) cleared=${cleared} despilled=${despilled}`);
