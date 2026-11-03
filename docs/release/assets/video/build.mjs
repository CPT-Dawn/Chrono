// Bundles stage.ts for the browser: `bun docs/release/assets/video/build.mjs`.
// Resolves Chrono's `@/` alias and WXT's `?inline` CSS imports, which Bun doesn't know.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = import.meta.dir;
const src = resolve(here, '../../../../src');

const result = await Bun.build({
  entrypoints: [join(here, 'stage.ts')],
  outdir: join(here, 'dist'),
  target: 'browser',
  format: 'iife',
  plugins: [
    {
      name: 'chrono',
      setup(build) {
        build.onResolve({ filter: /^@\// }, (args) => {
          const path = join(src, args.path.slice(2));
          return { path: /\.\w+(\?inline)?$/.test(path) ? path : `${path}.ts` };
        });
        build.onResolve({ filter: /\?inline$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path),
          namespace: 'inline-css',
        }));
        build.onLoad({ filter: /.*/, namespace: 'inline-css' }, (args) => ({
          contents: `export default ${JSON.stringify(readFileSync(args.path.replace(/\?inline$/, ''), 'utf8'))};`,
          loader: 'js',
        }));
      },
    },
  ],
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log('built', result.outputs.map((o) => o.path).join(', '));
