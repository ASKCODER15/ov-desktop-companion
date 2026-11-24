const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Generates the brand-new Apple-inspired minimalist Liquid-Glass squircle logo for PetFish:
 * Deep obsidian-sapphire frosted squircle + luminous specular top rim + iconic coral-tangerine
 * geometric wave/fin crest + gleaming pearl dot (looks crisp at 32px tray and 128/256px Desktop).
 */
function createAppLogoPng(size = 64) {
  const pixels = Buffer.alloc(size * size * 4, 0);

  function blend(x, y, r, g, b, a) {
    if (x < 0 || y < 0 || x >= size || y >= size || a <= 0) return;
    const idx = (y * size + x) * 4;
    const srcA = clamp(a, 0, 255) / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const v = ((y + 0.5) / size) * 2 - 1;

      // Apple superellipse (squircle) SDF: |u|^4.5 + |v|^4.5 <= r^4.5
      const sqDist = Math.pow(Math.abs(u), 4.4) + Math.pow(Math.abs(v), 4.4);
      const sqRad = Math.pow(0.92, 4.4);
      const edge = 1 - smoothstep(sqRad - 0.08, sqRad + 0.04, sqDist);
      if (edge <= 0.002) continue;

      // Liquid obsidian-glass gradient base
      const diag = clamp((u * 0.45 + v * 0.85 + 1.1) * 0.5, 0, 1);
      let bgR = Math.round(14 + (1 - diag) * 16);
      let bgG = Math.round(18 + (1 - diag) * 22);
      let bgB = Math.round(30 + (1 - diag) * 34);

      // Subtle warm ambient coral + crimson core backlight inside the glass
      const warmGlow = Math.exp(-((u - 0.1) * (u - 0.1) + (v + 0.05) * (v + 0.05)) * 2.8);
      bgR = clamp(Math.round(bgR + warmGlow * 76), 0, 255);
      bgG = clamp(Math.round(bgG + warmGlow * 32), 0, 255);
      bgB = clamp(Math.round(bgB + warmGlow * 28), 0, 255);

      // Subtle cool top-left Apple VisionOS glass highlight
      const topGlass = Math.exp(-((u + 0.35) * (u + 0.35) * 1.4 + (v + 0.72) * (v + 0.72) * 3.8));
      bgR = clamp(Math.round(bgR + topGlass * 70), 0, 255);
      bgG = clamp(Math.round(bgG + topGlass * 82), 0, 255);
      bgB = clamp(Math.round(bgB + topGlass * 105), 0, 255);

      blend(x, y, bgR, bgG, bgB, Math.round(edge * 255));

      // Luminous hairline glass rim
      const rim = smoothstep(sqRad - 0.18, sqRad - 0.06, sqDist) * (1 - smoothstep(sqRad - 0.03, sqRad + 0.03, sqDist));
      if (rim > 0.01) {
        const rimBright = 0.42 + (1 - v) * 0.28;
        blend(x, y, 240, 246, 255, Math.round(rim * rimBright * 170));
      }

      // Iconic Minimalist Modern Dual-Pet Emblem (Sleek Geometric Coral Fish Silhouette)
      // Main sleek droplet body
      const bx = (u - 0.12) / 0.46;
      const by = (v - 0.02) / 0.33;
      const bodyD = bx * bx + by * by;
      const bodyAlpha = 1 - smoothstep(0.86, 1.02, bodyD);

      // Sleek crescent tail fin on left
      const tx = (u + 0.45) / 0.24;
      const ty = (v - 0.02) / 0.28;
      const tailOuter = Math.hypot(tx, ty);
      const tailCut = Math.hypot((u + 0.56) / 0.19, (v - 0.02) / 0.23);
      const tailAlpha = (1 - smoothstep(0.84, 1.02, tailOuter)) * smoothstep(0.75, 0.96, tailCut);

      const emblemA = Math.max(bodyAlpha, tailAlpha);
      if (emblemA > 0.01) {
        // Vibrant Apple-grade coral -> luminous tangerine -> sunset crimson gradient
        const gt = clamp((u + 0.55) / 1.15, 0, 1);
        let er = 255;
        let eg = Math.round(78 + gt * 82 - v * 28);
        let eb = Math.round(42 + (1 - gt) * 34);

        // Single sleek translucent pearl stripe (signature modern minimalist OV mark)
        const stripe = Math.abs(u - 0.06 + v * v * 0.18);
        if (bodyAlpha > 0.3 && stripe < 0.072) {
          const sa = 1 - smoothstep(0.048, 0.072, stripe);
          er = Math.round(er + (255 - er) * sa * 0.92);
          eg = Math.round(eg + (252 - eg) * sa * 0.92);
          eb = Math.round(eb + (255 - eb) * sa * 0.92);
        }

        // Specular top gloss across the emblem
        const gloss = Math.exp(-((u - 0.15) * (u - 0.15) * 3.0 + (v + 0.16) * (v + 0.16) * 18.0));
        er = clamp(Math.round(er + gloss * 75), 0, 255);
        eg = clamp(Math.round(eg + gloss * 75), 0, 255);
        eb = clamp(Math.round(eb + gloss * 75), 0, 255);

        blend(x, y, er, eg, eb, Math.round(emblemA * 255));
      }

      // Crisp minimalist eye dot + tiny highlight
      const eyeD = Math.hypot(u - 0.36, v + 0.05);
      if (eyeD < 0.095) {
        const ea = 1 - smoothstep(0.072, 0.095, eyeD);
        blend(x, y, 16, 20, 32, Math.round(ea * 255));
      }
      const sparkD = Math.hypot(u - 0.382, v + 0.072);
      if (sparkD < 0.032) {
        blend(x, y, 255, 255, 255, 245);
      }

      // Subtle floating pearl bubble top-right
      const bubD = Math.hypot(u - 0.56, v + 0.44);
      if (bubD < 0.085) {
        const ba = 1 - smoothstep(0.06, 0.085, bubD);
        blend(x, y, 224, 244, 255, Math.round(ba * 180));
      }
    }
  }

  const rawRows = [];
  for (let y = 0; y < size; y++) {
    rawRows.push(Buffer.from([0]));
    rawRows.push(pixels.subarray(y * size * 4, (y + 1) * size * 4));
  }
  const compressed = zlib.deflateSync(Buffer.concat(rawRows));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function writePetFishIco(targetPath) {
  const outPath = targetPath || path.resolve(__dirname, '..', '..', 'assets', 'petfish.ico');
  const sizes = [32, 64, 128];
  const pngs = sizes.map((s) => ({ size: s, buf: createAppLogoPng(s) }));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const item of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = item.size >= 256 ? 0 : item.size;
    entry[1] = item.size >= 256 ? 0 : item.size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(item.buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += item.buf.length;
    entries.push(entry);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]));
  return outPath;
}

module.exports = { createNemoPng: createAppLogoPng, createAppLogoPng, writePetFishIco };
