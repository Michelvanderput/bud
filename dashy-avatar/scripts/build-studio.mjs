/**
 * Builds Dashy Studio as ONE self-contained HTML file (studio/dist/dashy-studio.html): the page, its CSS and the studio
 * code inline, plus the Dashy runtime as text so the studio can hand it out in exports. `--serve` rebuilds on change.
 */
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const runtime = async (format) => (await build({ entryPoints: ['src/index.ts'], bundle: true, minify: true, format, globalName: format === 'iife' ? 'DashyAvatar' : undefined, write: false })).outputFiles[0].text;

const runtimePlugin = (texts) => ({
  name: 'runtime',
  setup(b) {
    b.onResolve({ filter: /^virtual:runtime$/ }, () => ({ path: 'runtime', namespace: 'runtime' }));
    b.onLoad({ filter: /.*/, namespace: 'runtime' }, () => ({ contents: `export const esm = ${JSON.stringify(texts.esm)}; export const iife = ${JSON.stringify(texts.iife)};`, loader: 'js' }));
  },
});

function page(js) {
  const html = readFileSync('studio/index.html', 'utf8');
  // keep the inline script from closing itself early
  return html.replace('<!-- STUDIO_SCRIPT -->', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
}

const texts = { esm: await runtime('esm'), iife: await runtime('iife') };
const opts = { entryPoints: ['studio/src/main.ts'], bundle: true, minify: true, format: 'iife', write: false, plugins: [runtimePlugin(texts)], target: 'es2020' };
mkdirSync('studio/dist', { recursive: true });
const emit = (r) => { writeFileSync('studio/dist/dashy-studio.html', page(r.outputFiles[0].text)); console.log('studio/dist/dashy-studio.html', (r.outputFiles[0].text.length / 1024).toFixed(0) + ' KiB'); };

if (process.argv.includes('--serve')) {
  const ctx = await context({ ...opts, plugins: [...opts.plugins, { name: 'emit', setup(b) { b.onEnd(r => { if (!r.errors.length) emit(r); }); } }] });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'studio/dist', port: 5174 });
  console.log(`Dashy Studio: http://localhost:${port}/dashy-studio.html`);
} else emit(await build(opts));
