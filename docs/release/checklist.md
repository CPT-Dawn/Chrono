# Release checklist

Run this yourself before publishing to the Chrome Web Store or Firefox Add-ons. Do every check in both **Chrome** and **Firefox**, using the builds `npm run package` makes: load `.output/chrome-mv3` unpacked in `chrome://extensions`, and `.output/firefox-mv3/manifest.json` as a temporary add-on in `about:debugging`.

## Before you start

- [ ] `npm run typecheck` and `npm test` pass.
- [ ] `npm run package` succeeds and `web-ext lint` reports 0 errors.
- [ ] The version in `package.json` is the one being released.
- [ ] These six chrono.cptdawn.dev URLs are live and go where they should:
  - [ ] https://chrono.cptdawn.dev/ (homepage)
  - [ ] https://chrono.cptdawn.dev/welcome
  - [ ] https://chrono.cptdawn.dev/whats-new
  - [ ] https://chrono.cptdawn.dev/help
  - [ ] https://chrono.cptdawn.dev/tip
  - [ ] https://chrono.cptdawn.dev/goodbye

## Checks in Chrome and Firefox

YouTube serves two players, legacy and Delhi (the redesign). Check both where you can get them; another account or profile often gets the other one.

- [ ] **Legacy player**: the Panel, remaining, finish time, speed − / + and the Player badge all work.
- [ ] **Delhi player**: the same.
- [ ] **Background tabs**: middle-click several videos from the home page or subscriptions. Each tab shows the Panel when you switch to it, without reloading.
- [ ] **In-page navigation**: click from one video to another. The Panel moves to the new video at once, with no leftover times and never two Panels.
- [ ] **Chapters**: on a video with chapters, the Chapter scope follows the playhead. On one without, it's hidden.
- [ ] **Playlists**: the Playlist scope's remaining and finish time are right on
  - [ ] a long playlist (100+ entries),
  - [ ] a Mix,
  - [ ] a playlist with shuffle on.
- [ ] **Live**: on a live stream, Chrono shows no wrong remaining or finish time.
- [ ] **Ads**: Chrono pauses during an ad break and picks up again when the video resumes.
- [ ] **Playlist summary**: on a playlist page, the line shows content time, watch time at your speed and the number of unavailable entries.
- [ ] **Speed sync**: changing speed in YouTube's menu updates Chrono, and Chrono's − / + changes YouTube's speed.
- [ ] **Light / dark**: switch YouTube's theme. The Panel follows.
- [ ] **Theater** and **fullscreen**: the Panel and the Player badge behave in both.
- [ ] **Popup and ⋮ menu**: settings save, and "Support Chrono" and "Get help" open the right chrono.cptdawn.dev pages.
- [ ] **Install**: a fresh install opens the welcome page.
- [ ] **Update**: updating from the previous release opens the what's-new page on a major update, and nothing on a minor one.
- [ ] **Uninstall**: uninstalling opens the goodbye page.

## Publish

- [ ] Chrome Web Store: upload `chrono-<version>-chrome.zip`, with the listing text from [store-listing.md](store-listing.md).
- [ ] Firefox Add-ons: upload `chrono-<version>-firefox.zip` and `chrono-<version>-sources.zip`, with the same listing text.
