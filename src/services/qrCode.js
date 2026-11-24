/**
 * Zero-dependency 100% local offline QR Code (Byte Mode, Error Correction Level L, Versions 1..10)
 * Generates crisp inline SVG strings so pairing tokens NEVER leave the user's device!
 */
const EC_L = [
  null,
  { total: 26, data: 19, ecPerBlock: 7, blocks: 1, align: [] },
  { total: 44, data: 34, ecPerBlock: 10, blocks: 1, align: [6, 18] },
  { total: 70, data: 55, ecPerBlock: 15, blocks: 1, align: [6, 22] },
  { total: 100, data: 80, ecPerBlock: 20, blocks: 1, align: [6, 26] },
  { total: 134, data: 108, ecPerBlock: 26, blocks: 1, align: [6, 30] },
  { total: 172, data: 136, ecPerBlock: 18, blocks: 2, align: [6, 34] },
  { total: 196, data: 156, ecPerBlock: 20, blocks: 2, align: [6, 22, 38] },
  { total: 242, data: 194, ecPerBlock: 24, blocks: 2, align: [6, 24, 42] },
  { total: 292, data: 232, ecPerBlock: 30, blocks: 2, align: [6, 26, 46] },
  { total: 346, data: 274, ecPerBlock: 18, blocks: 4, align: [6, 28, 50] },
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGF() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data, ecCount) {
  const gen = rsGenerator(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 1; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return Array.from(res.slice(data.length));
}

function encodeBits(bytes, ver) {
  const info = EC_L[ver];
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  // Mode 0100 (Byte), Char count (8 bits for v1..9, 16 bits for v10)
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const maxBits = info.data * 8;
  for (let i = 0; i < 4 && bits.length < maxBits; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [0xec, 0x11];
  let pi = 0;
  while (bits.length < maxBits) {
    push(pads[pi++ % 2], 8);
  }
  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    codewords.push(v);
  }

  // Interleave blocks (Level L for v1..10: all blocks have same or +1 size)
  const shortLen = Math.floor(info.data / info.blocks);
  const longBlocks = info.data % info.blocks;
  const shortBlocks = info.blocks - longBlocks;
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let b = 0; b < info.blocks; b++) {
    const len = b < shortBlocks ? shortLen : shortLen + 1;
    const chunk = codewords.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(chunk);
    ecBlocks.push(rsRemainder(chunk, info.ecPerBlock));
  }

  const out = [];
  const maxDataLen = shortLen + (longBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) out.push(blk[i]);
  }
  for (let i = 0; i < info.ecPerBlock; i++) {
    for (const blk of ecBlocks) out.push(blk[i]);
  }
  return out;
}

function buildQrMatrix(text) {
  const bytes = Buffer.from(String(text || ''), 'utf8');
  let ver = 1;
  while (ver <= 10) {
    const headerBytes = ver <= 9 ? 2 : 3;
    if (bytes.length + headerBytes <= EC_L[ver].data) break;
    ver++;
  }
  if (ver > 10) throw new Error('QR payload too large');

  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunc = (r, c, dark) => {
    if (r < 0 || c < 0 || r >= size || c >= size) return;
    mod[r][c] = dark ? 1 : 0;
    isFunc[r][c] = 1;
  };

  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const dark =
          dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r0 + dr, c0 + dc, dark);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = EC_L[ver].align;
  for (const r of align) {
    for (const c of align) {
      if (isFunc[r][c]) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          setFunc(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }

  // Reserve format info + dark module
  for (let i = 0; i < 9; i++) {
    if (i !== 6) { setFunc(8, i, false); setFunc(i, 8, false); }
  }
  for (let i = 0; i < 8; i++) {
    setFunc(8, size - 1 - i, false);
    setFunc(size - 1 - i, 8, false);
  }
  setFunc(size - 8, 8, true);

  // Version info (v7..10)
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
    const vbits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((vbits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(a, b, dark);
      setFunc(b, a, dark);
    }
  }

  // Place data bits with mask 0 ((r + c) % 2 === 0)
  const codewords = encodeBits(bytes, ver);
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = (((right + 1) >> 1) & 1) === 0;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunc[r][c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          dark = ((codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        // Apply mask pattern 0: (r + c) % 2 === 0
        if ((r + c) % 2 === 0) dark = !dark;
        mod[r][c] = dark ? 1 : 0;
      }
    }
  }

  // Write Format Information for EC Level L (01) + Mask 0 (000) -> data = 0b01000 = 8
  const fmtData = 0b01000;
  let rem = fmtData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  const fmtBits = ((fmtData << 10) | rem) ^ 0x5412;

  for (let i = 0; i <= 5; i++) setFunc(8, i, ((fmtBits >> (14 - i)) & 1) === 1);
  setFunc(8, 7, ((fmtBits >> 8) & 1) === 1);
  setFunc(8, 8, ((fmtBits >> 7) & 1) === 1);
  setFunc(7, 8, ((fmtBits >> 6) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, ((fmtBits >> (14 - i)) & 1) === 1);

  for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, ((fmtBits >> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setFunc(size - 15 + i, 8, ((fmtBits >> i) & 1) === 1);

  return mod;
}

function generateQrSvg(text, pxSize = 168) {
  try {
    const mod = buildQrMatrix(text);
    const n = mod.length;
    const quiet = 3;
    const total = n + quiet * 2;
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (mod[r][c] === 1) {
          d += `M${c + quiet},${r + quiet}h1v1h-1z`;
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${pxSize}" height="${pxSize}" shape-rendering="crispEdges"><rect width="${total}" height="${total}" rx="2" fill="#ffffff"/><path d="${d}" fill="#0a0e1a"/></svg>`;
  } catch {
    return '';
  }
}

module.exports = { generateQrSvg, buildQrMatrix };
