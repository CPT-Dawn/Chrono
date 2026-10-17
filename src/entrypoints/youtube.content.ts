import { startPlaylistPage } from '@/playlist-page';
import { startWatchPage } from '@/watch-page';

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  async main(ctx) {
    await Promise.all([startWatchPage(ctx), startPlaylistPage(ctx)]);
  },
});
