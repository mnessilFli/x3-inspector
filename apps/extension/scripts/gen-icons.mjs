// Generates the extension icons (navy rounded square with "X3") without any dependency.
// Usage: node scripts/gen-icons.mjs  (writes public/icons/icon{16,32,48,128}.png)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../public/icons');
mkdirSync(outDir, { recursive: true });

// 5x7 bitmap glyphs
const GLYPHS = {
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
};

const NAVY = [3, 45, 96];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size) {
  const px = new Uint8Array(size * size * 4);
  const radius = size * 0.18;
  const textCols = 11; // "X" (5) + gap (1) + "3" (5)
  const scale = Math.max(1, Math.floor((size * 0.7) / textCols));
  const tw = textCols * scale;
  const th = 7 * scale;
  const ox = Math.floor((size - tw) / 2);
  const oy = Math.floor((size - th) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const inCorner = cx < radius && cy < radius && Math.hypot(radius - cx, radius - cy) > radius;
      if (inCorner) continue; // transparent
      let color = NAVY;
      const gx = Math.floor((x - ox) / scale);
      const gy = Math.floor((y - oy) / scale);
      if (x >= ox && y >= oy && gx < textCols && gy < 7) {
        const glyph = gx < 5 ? GLYPHS.X : gx > 5 ? GLYPHS[3] : null;
        const col = gx < 5 ? gx : gx - 6;
        if (glyph && glyph[gy][col] === '1') color = WHITE;
      }
      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(resolve(outDir, `icon${size}.png`), png(size));
}
console.log(`icons written to ${outDir}`);
