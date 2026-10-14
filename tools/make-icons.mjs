// Draws the cairn icon as PNGs (16, 32, 48, 128 px) into icons/.
// No dependencies: flattens the stone curves to polygons, fills them with
// 4×4 supersampling for smooth edges, and writes PNG files by hand.
// Run: node tools/make-icons.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Same three stones as src/ui.js (viewBox 0 0 64 64).
const STONES = [
  ['M25 9 C28 4 37 3 41 7 C45 11 42 16 34 16.5 C27 17 22 13.5 25 9 Z', [0xa6, 0xcb, 0xc5]],
  ['M16 26 C19 20 40 19.5 46.5 22.5 C52 25.5 49 32.5 35 33 C22 33.5 13 31 16 26 Z', [0x5e, 0x98, 0x90]],
  ['M8 46 C10 39 47 36.5 55 41 C61 45 57 54.5 34 55 C15 55.5 5.5 52 8 46 Z', [0x33, 0x62, 0x5c]],
];

// Only handles the "M x y C … Z" paths above.
function toPolygon(d) {
  const nums = d.match(/-?\d*\.?\d+/g).map(Number);
  let [x, y] = nums.splice(0, 2);
  const pts = [[x, y]];
  while (nums.length >= 6) {
    const [x1, y1, x2, y2, x3, y3] = nums.splice(0, 6);
    for (let t = 1; t <= 24; t++) {
      const s = t / 24, u = 1 - s;
      pts.push([
        u * u * u * x + 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s * x3,
        u * u * u * y + 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s * y3,
      ]);
    }
    [x, y] = [x3, y3];
  }
  return pts;
}

function inside(poly, px, py) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const polys = STONES.map(([d, rgb]) => [toPolygon(d), rgb]);
  const SS = 4;
  const scale = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      for (const [poly, rgb] of polys) {
        let cover = 0;
        for (let sy = 0; sy < SS; sy++)
          for (let sx = 0; sx < SS; sx++)
            if (inside(poly, (x + (sx + 0.5) / SS) * scale, (y + (sy + 0.5) / SS) * scale)) cover++;
        if (!cover) continue;
        const a = cover / (SS * SS);
        const o = (y * size + x) * 4;
        const prevA = px[o + 3] / 255;
        const outA = a + prevA * (1 - a);
        for (let c = 0; c < 3; c++) px[o + c] = Math.round((rgb[c] * a + px[o + c] * prevA * (1 - a)) / outA);
        px[o + 3] = Math.round(outA * 255);
      }
    }
  }
  return px;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) raw.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(new URL(`icon${size}.png`, outDir), png(size, render(size)));
  console.log(`icons/icon${size}.png`);
}
