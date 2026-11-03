// Renders a composition frame by frame under virtual time and encodes it.
//   node record.mjs <comp.html> <out.mp4> [--fps 60] [--scale 2] [--from s] [--to s] [--stills s,s,...]
// --stills writes PNGs at those seconds instead of a video, for checking a cut quickly.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const [html, out, ...rest] = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i === -1 ? fallback : rest[i + 1];
};
const fps = Number(flag('fps', 60));
const scale = Number(flag('scale', 2));
const stills = flag('stills', '')
  .split(',')
  .filter(Boolean)
  .map(Number);
const W = 1920, H = 1080;

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
page.on('console', (m) => (m.type() === 'error' || m.text().startsWith('DEBUG')) && console.error('page:', m.text()));
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.addInitScript({ content: readFileSync(join(here, 'virtual-time.js'), 'utf8') });
await page.goto('file://' + resolve(html));
await page.evaluate(() => document.fonts.ready);
// Images decode on real time; give them a moment before the clock starts.
await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
const duration = await page.evaluate(() => window.DURATION);
const from = Number(flag('from', 0)), to = Number(flag('to', duration));
const cdp = await page.context().newCDPSession(page);
const shot = async () =>
  Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip: { x: 0, y: 0, width: W, height: H, scale } })).data, 'base64');

const dt = 1000 / fps;
const total = Math.round(to * fps);
const first = Math.round(from * fps);
await page.evaluate(() => window.START());

if (stills.length) {
  const wanted = new Set(stills.map((s) => Math.round(s * fps)));
  const last = Math.max(...wanted);
  for (let f = 0; f <= last; f++) {
    if (f > 0) await page.evaluate((ms) => window.__step(ms), dt);
    if (wanted.has(f)) {
      const { writeFileSync } = await import('node:fs');
      const path = out.replace(/(\.\w+)?$/, `-${(f / fps).toFixed(2)}s.png`);
      writeFileSync(path, await shot());
      console.log('still', path);
    }
  }
  await browser.close();
  process.exit(0);
}

const ffmpeg = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-tune', 'animation',
  '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  '-movflags', '+faststart', out,
], { stdio: ['pipe', 'inherit', 'inherit'] });

const started = Date.now();
for (let f = 0; f < total; f++) {
  if (f > 0) await page.evaluate((ms) => window.__step(ms), dt);
  if (f < first) continue;
  const frame = await shot();
  if (!ffmpeg.stdin.write(frame)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (f % fps === 0) process.stdout.write(`\r${(f / fps).toFixed(0)}s / ${to}s  (${((Date.now() - started) / 1000).toFixed(0)}s elapsed)`);
}
ffmpeg.stdin.end();
await new Promise((r) => ffmpeg.on('close', r));
await browser.close();
console.log('\nwrote', out);
