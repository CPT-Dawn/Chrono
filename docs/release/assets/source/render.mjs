// Render store assets: node render.mjs <html> <width> <height> <out.png> [scale]
// Renders at `scale`× and downsamples with Lanczos to the exact store size for crisp edges.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const [html, w, h, out, scaleArg] = process.argv.slice(2);
const width = Number(w), height = Number(h), scale = Number(scaleArg ?? 2);
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
await page.goto('file://' + resolve(html));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const hi = out.replace(/\.png$/, '@hi.png');
await page.screenshot({ path: hi, clip: { x: 0, y: 0, width, height } });
await browser.close();
execFileSync('magick', [hi, '-filter', 'Lanczos', '-resize', `${width}x${height}!`, '-strip', '-define', 'png:compression-level=9', out]);
unlinkSync(hi);
console.log('wrote', out);
