/** Contact sheet of every state with the full decor, for checking by eye: npx tsx scripts/sheet.ts out.svg */
import { writeFileSync } from 'node:fs';
import { ALL_STATES, renderSvg, settledFrame } from '../src/static';
const style = { mouth: true, effects: true, shadow: true, shine: .6 };
const cols = 7, cw = 170;
const cells = ALL_STATES.map((s, i) => {
  const F = settledFrame(s, { style });
  const inner = renderSvg(F.G, { idPrefix: `c${i}`, style, decor: F.D, margin: 0 }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg x="${(i % cols) * cw}" y="${Math.floor(i / cols) * 190}" width="160" height="160" viewBox="0 0 300 300" overflow="visible">${inner}</svg><text x="${(i % cols) * cw + 80}" y="${Math.floor(i / cols) * 190 + 176}" text-anchor="middle" font-family="sans-serif" font-size="13">${s}</text>`;
}).join('');
writeFileSync(process.argv[2] ?? 'sheet.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cw}" height="${Math.ceil(ALL_STATES.length / cols) * 190}"><rect width="100%" height="100%" fill="#eef0f3"/>${cells}</svg>`);
