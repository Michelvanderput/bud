/**
 * Regenerates everything in exports/ from the source: `npm run export`.
 * SVG is pure string work; PNGs are rasterised in headless Chromium (Playwright) and encoded here, so app icons can be
 * written without an alpha channel (iOS rejects transparency) and favicons with one.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { createDashy } from '../src/core';
import { ALL_STATES, recordFrames, renderAnimatedSvg, renderSvg, settledFrame, settledGeometry, stillGeometry } from '../src/static';

const names = createDashy().states;
const out = (p: string, data: string | Buffer) => { mkdirSync(p.slice(0, p.lastIndexOf('/')), { recursive: true }); writeFileSync(p, data); };

// ---- PNG encoder (RGB or RGBA, no filtering: small enough for icons)
const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(rgba: Buffer, w: number, h: number, alpha: boolean) {
  const ch = alpha ? 4 : 3, raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) raw[y * (w * ch + 1) + 1 + x * ch + c] = rgba[(y * w + x) * 4 + c];
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(images: { size: number; png: Buffer }[]) {
  const head = Buffer.alloc(6 + 16 * images.length); head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let off = head.length;
  images.forEach((im, i) => {
    const e = 6 + 16 * i; head[e] = im.size; head[e + 1] = im.size; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(im.png.length, e + 8); head.writeUInt32LE(off, e + 12); off += im.png.length;
  });
  return Buffer.concat([head, ...images.map(i => i.png)]);
}

async function main() {
  // Playwright is not a dependency of the package: use the one installed globally or in the project (npm i -D playwright).
  const { chromium } = createRequire(import.meta.url)('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas>');
  /** Rasterises an SVG (or a whole HTML snippet when `html`) to RGBA pixels. */
  const raster = async (svg: string, w: number, h = w): Promise<Buffer> => Buffer.from(await page.evaluate(async ({ svg, w, h }) => {
    const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await img.decode();
    const c = document.querySelector('canvas')!; c.width = w; c.height = h;
    const g = c.getContext('2d')!; g.clearRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data; let s = ''; for (let i = 0; i < d.length; i += 32768) s += String.fromCharCode(...d.subarray(i, i + 32768));
    return btoa(s);
  }, { svg, w, h }), 'base64');

  for (const s of ALL_STATES) {
    const title = `Dashy: ${names[s].n}`, G = settledGeometry(s);
    const full = renderSvg(G, { title }), small = renderSvg(G, { title, variant: 'small', margin: 10 });
    out(`exports/svg/${s}.svg`, full);
    out(`exports/svg/small/${s}.svg`, small);
    for (const px of [128, 512]) out(`exports/png/${s}-${px}.png`, png(await raster(full, px), px, px, true));
    for (const px of [16, 32]) out(`exports/favicon/${s}-${px}.png`, png(await raster(small, px), px, px, true));
    const icon = renderSvg(stillGeometry(G), { title, margin: 0, background: '#101214' });
    out(`exports/app-icon/${s}-1024.png`, png(await raster(icon, 1024), 1024, 1024, false));
    if (s === 'idle') out('exports/app-icon/apple-touch-icon.png', png(await raster(icon, 180), 180, 180, false));

    // the upgrade: the same state with mouth, blush and effects, still and animated
    const style = { mouth: true, effects: true, shadow: true, shine: .6 };
    const F = settledFrame(s, { style });
    out(`exports/expressive/${s}.svg`, renderSvg(F.G, { title, style, decor: F.D }));
    out(`exports/animated/${s}.svg`, renderAnimatedSvg(recordFrames(s, { durationMs: 2000, fps: 20 }), 20, { title }));
    out(`exports/animated/expressive/${s}.svg`, renderAnimatedSvg(recordFrames(s, { durationMs: 2000, fps: 20, style }), 20, { title, style }));
  }
  const fav = renderSvg(stillGeometry(settledGeometry('idle')), { variant: 'small', margin: 10 });
  out('exports/favicon/favicon.svg', fav);
  const favs = [];
  for (const px of [16, 32, 48]) { const b = png(await raster(fav, px), px, px, true); out(`exports/favicon/favicon-${px}.png`, b); favs.push({ size: px, png: b }); }
  out('exports/favicon/favicon.ico', ico(favs));

  // overview sheet: every state, full and small
  const cols = 7, cw = 170, rh = 230, rows = Math.ceil(ALL_STATES.length / cols), W = cols * cw, H = rows * rh + 20;
  const cells = ALL_STATES.map((s, i) => {
    const x = (i % cols) * cw, y = Math.floor(i / cols) * rh + 20, G = settledGeometry(s);
    const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/, '');
    const big = inner(renderSvg(G, { idPrefix: `b${i}` })), sm = inner(renderSvg(G, { idPrefix: `s${i}`, variant: 'small', margin: 10 }));
    return `<svg x="${x + 25}" y="${y}" width="120" height="120" viewBox="20 20 260 260">${big}</svg>
<text x="${x + 85}" y="${y + 145}" text-anchor="middle" font-family="Inter,Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#17181a">${names[s].n}</text>
<text x="${x + 85}" y="${y + 164}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="12" fill="#6b6b66">${s}</text>
<svg x="${x + 72}" y="${y + 174}" width="26" height="26" viewBox="10 10 280 280">${sm}</svg>`;
  }).join('\n');
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#f4f4f1"/>${cells}</svg>`;
  out('exports/docs/states.png', png(await raster(sheet, W, H), W, H, false));
  await browser.close();
  console.log(`exported ${ALL_STATES.length} states`);
}
main().catch(e => { console.error(e); process.exit(1); });
