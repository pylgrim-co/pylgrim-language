/**
 * One-shot icon generator: solid parchment square with a darker "p·"
 * block glyph, emitted as valid PNGs with zero image dependencies.
 * Run: npx tsx src/scripts/make-icons.ts
 */
import { deflateSync } from "zlib";
import { writeFileSync } from "fs";

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function makePng(size: number): Buffer {
  const bg = [0xfa, 0xf7, 0xf2];
  const ink = [0x9a, 0x3b, 0x1e];
  // Simple glyph: a thick vertical bar with a bowl (a blocky "p"), centred.
  const rows: Buffer[] = [];
  const s = size;
  const barX0 = Math.floor(s * 0.3);
  const barX1 = Math.floor(s * 0.42);
  const barY0 = Math.floor(s * 0.22);
  const barY1 = Math.floor(s * 0.82);
  const bowlX1 = Math.floor(s * 0.7);
  const bowlY1 = Math.floor(s * 0.56);
  for (let y = 0; y < s; y++) {
    const row = Buffer.alloc(1 + s * 3);
    row[0] = 0; // filter: none
    for (let x = 0; x < s; x++) {
      const inBar = x >= barX0 && x < barX1 && y >= barY0 && y < barY1;
      const inBowlOuter = x >= barX0 && x < bowlX1 && y >= barY0 && y < bowlY1;
      const inBowlInner =
        x >= barX1 + Math.floor(s * 0.06) &&
        x < bowlX1 - Math.floor(s * 0.1) &&
        y >= barY0 + Math.floor(s * 0.1) &&
        y < bowlY1 - Math.floor(s * 0.1);
      const on = inBar || (inBowlOuter && !inBowlInner);
      const [r, g, b] = on ? ink : bg;
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0);
  ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, makePng(size));
  console.log(`public/icon-${size}.png written`);
}
