import { defineConfig } from 'wxt';

/**
 * Chrono's icons, drawn by `bun run icons` from the SVGs in icons/. Chrome takes PNGs only.
 * Firefox takes the SVGs, and in its toolbar a one-colour glyph that suits the theme: the
 * dark glyph on light toolbars and the light one on dark toolbars.
 */
const PNG_ICONS = { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' };
const SVG_ICONS = {
  16: 'icon/chrono-16.svg',
  32: 'icon/chrono.svg',
  48: 'icon/chrono.svg',
  96: 'icon/chrono.svg',
  128: 'icon/chrono.svg',
};
const TOOLBAR_ICONS = [16, 32].map((size) => ({
  light: 'icon/toolbar-light.svg',
  dark: 'icon/toolbar-dark.svg',
  size,
}));

export default defineConfig({
  srcDir: 'src',
  hooks: {
    // Only Firefox reads the SVG icons.
    'build:publicAssets': (wxt, files) => {
      if (wxt.config.browser === 'firefox') return;
      const svgs = files.filter((file) => file.relativeDest.endsWith('.svg'));
      for (const svg of svgs) files.splice(files.indexOf(svg), 1);
    },
  },
  manifest: ({ browser }) => ({
    name: '__MSG_extName__',
    short_name: '__MSG_extShortName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    homepage_url: 'https://chrono.cptdawn.dev/',
    permissions: ['storage'],
    icons: browser === 'firefox' ? SVG_ICONS : PNG_ICONS,
    ...(browser !== 'firefox' && { minimum_chrome_version: '121' }),
    ...(browser === 'firefox' && {
      action: { default_icon: { 16: SVG_ICONS[16], 32: SVG_ICONS[32] }, theme_icons: TOOLBAR_ICONS },
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
