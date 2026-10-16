import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'happy-dom',
    environmentOptions: { happyDOM: { url: 'https://www.youtube.com/' } },
    setupFiles: ['tests/harness/setup.ts'],
  },
});
