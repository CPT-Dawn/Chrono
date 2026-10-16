import { configDefaults, defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Claude Code keeps other branches' worktrees here, with their own tests.
    exclude: [...configDefaults.exclude, '.claude/**'],
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'https://www.youtube.com/' } },
    setupFiles: ['tests/harness/setup.ts'],
  },
});
