import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    homepage_url: 'https://chrono.cptdawn.dev/',
    permissions: ['storage'],
    ...(browser !== 'firefox' && { minimum_chrome_version: '121' }),
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'chrono@cptdawn.dev',
          // 140 is the first Firefox that knows data_collection_permissions.
          strict_min_version: '140.0',
          data_collection_permissions: { required: ['none'] },
        },
        // Firefox for Android learnt data_collection_permissions in 142.
        gecko_android: { strict_min_version: '142.0' },
      },
    }),
  }),
});
