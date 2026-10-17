import { startOnboarding } from '@/onboarding';

// Chrome runs this as the MV3 service worker, Firefox as a background script.
export default defineBackground(() => {
  startOnboarding();
});
