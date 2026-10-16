import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  resolve: {
    // WXT fakes `wxt/browser` but not the package wxt/storage reads `browser` from, which
    // would otherwise capture whatever global exists when the setup file first imports it.
    alias: {
      '@wxt-dev/browser': fileURLToPath(new URL('node_modules/wxt/dist/virtual/mock-browser.mjs', import.meta.url)),
    },
  },
  test: {
    // Claude Code keeps other branches' worktrees here, with their own tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'https://www.youtube.com/' } },
    setupFiles: ['tests/harness/setup.ts'],
    // Vitest blanks CSS imports by default. Tests assert colours the viewer sees.
    css: { include: /src\/.+\.css/ },
    server: { deps: { inline: ['@wxt-dev/storage'] } },
  },
});
