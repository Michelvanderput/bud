/**
 * Photo mode: a still of Dashy as SVG or PNG, on a transparent, solid, linear-gradient or radial-gradient background.
 * `renderPng` needs a browser (canvas); everything else is pure string work.
 */
export type Background =
  | string
  | { type: 'linear'; from: string; to: string; /** degrees, 0 = top to bottom. Default 0. */ angle?: number }
  | { type: 'radial'; from: string; to: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The `<defs>` content (a gradient, or nothing) and the `fill` value to use for a full-bleed rectangle. */
export function backgroundDefs(b: Background, id: string): { defs: string; fill: string } {
  if (typeof b === 'string') return { defs: '', fill: esc(b) };
  const gid = `${id}bg`, stops = `<stop offset="0" stop-color="${esc(b.from)}"/><stop offset="1" stop-color="${esc(b.to)}"/>`;
  if (b.type === 'radial') return { defs: `<radialGradient id="${gid}" cx="50%" cy="50%" r="70%">${stops}</radialGradient>`, fill: `url(#${gid})` };
  const a = ((b.angle ?? 0) * Math.PI) / 180, dx = Math.sin(a) / 2, dy = Math.cos(a) / 2;
  const f = (v: number) => (v * 100).toFixed(1) + '%';
  return { defs: `<linearGradient id="${gid}" x1="${f(.5 - dx)}" y1="${f(.5 - dy)}" x2="${f(.5 + dx)}" y2="${f(.5 + dy)}">${stops}</linearGradient>`, fill: `url(#${gid})` };
}

/** Rasterises an SVG string to a PNG `size` x `size` px. Browser only. */
export async function renderPng(svg: string, size = 512): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
    return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('PNG export failed'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}
