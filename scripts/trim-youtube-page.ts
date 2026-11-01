// Turns a YouTube page saved from a real browser into a small, readable saved page for tests.
//
//   bun run trim-page -- <saved.html> tests/pages/<name>.html
//
// It saves links nested in links as <span>s so parsing keeps the page's structure, removes
// what tests never need (scripts, styles, icons, inline data: images, SingleFile's markup)
// and anything personal (the signed-in masthead, the subscriptions guide, comments, live
// chat, the query of ad click-tracking links), keeps only the first few related and
// recommended videos, and writes one element per line so diffs stay readable.
import { readFileSync, writeFileSync } from 'node:fs';
import { trimPage } from './saved-page';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: bun run trim-page -- <saved.html> <out.html>');
  process.exit(1);
}

const raw = readFileSync(input, 'utf8');
const { page, nestedLinks } = trimPage(raw);
writeFileSync(output, page);
console.log(`Wrote ${output}`);
console.log(`  ${nestedLinks} nested ${nestedLinks === 1 ? 'link' : 'links'} saved as <span>`);
console.log(`  ${formatSize(Buffer.byteLength(raw))} → ${formatSize(Buffer.byteLength(page))}`);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
