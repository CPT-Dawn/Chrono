import { startBackgroundLifecycle } from '@/background-lifecycle';

// Chrome runs this as the MV3 service worker, Firefox as a background script.
export default defineBackground(() => {
  startBackgroundLifecycle();
});
