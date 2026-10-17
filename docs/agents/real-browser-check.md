# Real-browser check

How to load Chrono's builds into real Chromium and Firefox, headless, from this machine, to verify a change on live YouTube.

## Setup

Playwright's browsers are installed at `~/.cache/ms-playwright/` (`chromium-1248`, `firefox-1555`), but `playwright` is not a repo dependency. Install `playwright-core@1.64.1` in a scratch directory (it's the version built for those revisions; older ones can't drive `firefox-1555`) and pass `executablePath`.

Build first: `npm run build` (`.output/chrome-mv3`) and `npm run build:firefox` (`.output/firefox-mv3`).

## Chromium

```js
chromium.launchPersistentContext(profileDir, {
  executablePath: `${HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`,
  headless: true,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
```

The popup is at `chrome-extension://<id>/popup.html`; take the id from `context.serviceWorkers()[0].url()`.

## Firefox

Dropping the `.xpi` into the profile's `extensions/` folder silently fails, because the package is unsigned. Instead:

1. Launch with `args: ['--start-debugger-server', PORT]` and the prefs `devtools.debugger.remote-enabled`, `devtools.chrome.enabled` = true and `devtools.debugger.prompt-connection` = false.
2. Over raw TCP to that port (RDP framing `<len>:<json>`), send `{to: 'root', type: 'getRoot'}`, then `{to: <addonsActor>, type: 'installTemporaryAddon', addonPath: '<abs path>/.output/firefox-mv3'}`.

Playwright can't navigate Firefox to `about:` or `moz-extension://` pages (they time out), so the popup can't be checked in Firefox this way. Inspect `extensions.json` or `prefs.js` in the profile instead.

## Driving YouTube

- Live YouTube is reachable. Headless sessions get the Delhi player.
- To get the legacy player, intercept `youtube.com/watch` with `page.route` and switch the `delhi_*` experiment flags in the HTML from `true` to `false`.
- Dark theme: add the cookie `PREF=f6=400` on `.youtube.com`.
- The Panel is a `<section>` with an open shadow root containing `.panel`.
- Pre-roll ads are common: wait while `#movie_player` has `ad-showing` before checking times.
- Headless Chromium and Firefox report every tab as `visible`, so background-tab behaviour can only be tested at Seam 1.
- Headless Firefox doesn't enter fullscreen on `f`; check fullscreen in Chromium.
- For in-page navigation, click a visible link (e.g. a related video) or use `page.goBack()`. Don't synthesise `yt-navigate` events.
- To catch sub-frame flashes, use `context.addInitScript` to observe the Panel's shadow root and log every text change; 50 ms polling misses them.
- `context.setOffline(true)` shows how YouTube behaves when a navigation fails.
