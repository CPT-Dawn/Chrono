// Draws Chrono's icons from their SVG sources in icons/ into public/icon/.
//
//   bun run icons
//
// Chrome takes only PNGs: 16 from the hand-tuned chrono-16.svg, 32 and 48 from the master
// chrono.svg, and 128 as the Chrome Web Store asks, 96px of artwork in 16px of transparent
// padding. Firefox also takes the SVGs, and a dark and a light copy of the toolbar glyph for
// action.theme_icons. Needs rsvg-convert (librsvg).
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const source = (name: string) => join(root, 'icons', name);
const out = join(root, 'public', 'icon');

/** Firefox's own toolbar icon colours: a dark glyph for light themes, a light one for dark. */
const TOOLBAR_COLOURS = { dark: '#5b5b66', light: '#fbfbfe' } as const;

/** Each PNG: its size, its source, and the artwork's size within it if it is padded. */
const PNGS = [
  { size: 16, svg: 'chrono-16.svg' },
  { size: 32, svg: 'chrono.svg' },
  { size: 48, svg: 'chrono.svg' },
  { size: 128, svg: 'chrono.svg', artwork: 96 },
];

mkdirSync(out, { recursive: true });

for (const { size, svg, artwork = size } of PNGS) {
  const padding = (size - artwork) / 2;
  const args = ['-w', `${artwork}`, '-h', `${artwork}`, '--page-width', `${size}`, '--page-height', `${size}`];
  args.push('--left', `${padding}`, '--top', `${padding}`, '-o', join(out, `${size}.png`), source(svg));
  const result = spawnSync('rsvg-convert', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`rsvg-convert failed for ${size}.png: ${result.error ?? result.stderr}`);
  console.log(`Wrote public/icon/${size}.png`);
}

for (const svg of ['chrono.svg', 'chrono-16.svg']) {
  writeFileSync(join(out, svg), readFileSync(source(svg)));
  console.log(`Wrote public/icon/${svg}`);
}

const toolbar = readFileSync(source('toolbar.svg'), 'utf8');
for (const [variant, colour] of Object.entries(TOOLBAR_COLOURS)) {
  writeFileSync(join(out, `toolbar-${variant}.svg`), toolbar.replaceAll(TOOLBAR_COLOURS.dark, colour));
  console.log(`Wrote public/icon/toolbar-${variant}.svg`);
}
