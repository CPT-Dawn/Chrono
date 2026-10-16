import { servePlayerSpeed } from '@/speed-bridge';

// Runs in the page's own context, where YouTube's player API is visible. Extension APIs
// aren't available here.
export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  world: 'MAIN',
  main() {
    // The browser ignores what main returns. Tests use it to stop the script.
    return servePlayerSpeed(document);
  },
});
