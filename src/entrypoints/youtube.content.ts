import { startWatchPage } from '@/watch-page';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main(ctx) {
    startWatchPage(ctx);
  },
});
