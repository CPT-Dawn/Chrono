# Chrono – Finish Time & Speed for YouTube

Chrono is a browser extension that tells you how long a YouTube video, chapter or playlist will really take at your speed, and when you'll finish.

Website: [chrono.cptdawn.dev](https://chrono.cptdawn.dev/)

## What it does

- **Panel**: a collapsible block at the top of YouTube's sidebar, styled like YouTube's own panels. Its compact row shows the video's **remaining** (watch time at your speed, e.g. "12:30 left at 1.5×"), its **finish time**, and speed − / +. Expanded, it shows:
  - the **speed table**: the remaining and finish time at each common speed;
  - the **Chapter scope** and the **Playlist scope**;
  - **targets**: set a finish time to meet or the watch time you have, and Chrono shows the **required speed**.
- **Player badge** (optional): "· ends 3:45 PM" after the player's own time display, visible in fullscreen too.
- **Playlist summary**: one line on playlist pages, e.g. "4h 12m total · 2h 48m at 1.5× · 3 unavailable".
- **Speed sync**: Chrono's speed and YouTube's speed are always the same.
- Chrono follows YouTube's light or dark theme, and pauses its calculations during an **ad break**.

## Supported browsers

- Chrome 121 or later. Other Chromium browsers that install from the Chrome Web Store, such as Edge, Brave, Vivaldi and Arc, should work too but aren't tested.
- Firefox 128 or later, on desktop.

## Privacy

Chrono collects no data: no analytics, no crash reports, no usage tracking ([ADR-0002](docs/adr/0002-no-telemetry.md)). Its only permission is storage for your settings, and it runs only on youtube.com.

"Get help" and "Report it" open a page on chrono.cptdawn.dev, and only when you click them. They pre-fill your Chrono version, browser and OS, and for a report, what Chrono recognised on YouTube's page. They never send video IDs, titles or addresses.

## Development

Requires Node.js 22.18 or later.

```sh
npm ci
npm run dev            # Chrome, with live reload
npm run dev:firefox    # Firefox
npm run typecheck
npm test
```

The tests run Chrono on saved YouTube pages in `tests/pages/`. When YouTube changes its page, save the new one from a real browser and trim it into a saved page with `npm run trim-page -- <saved.html> tests/pages/<name>.html`. It removes scripts, styles and anything personal, such as the signed-in masthead and comments, and writes one element per line so diffs stay readable.

Build the store packages with one command:

```sh
npm run package
```

It writes three files to `.output/` and then runs `web-ext lint` on the Firefox build:

- `chrono-<version>-chrome.zip`, for the Chrome Web Store;
- `chrono-<version>-firefox.zip`, for Firefox Add-ons;
- `chrono-<version>-sources.zip`, the source package Firefox Add-ons asks for.

To build the Firefox extension from the sources package (for Firefox Add-ons source review), run `npm ci && npm run build:firefox`; the result is in `.output/firefox-mv3`.

To try a build by hand, load `.output/chrome-mv3` as an unpacked extension in `chrome://extensions`, or `.output/firefox-mv3/manifest.json` as a temporary add-on in `about:debugging`.

Before a release, work through the [release checklist](docs/release/checklist.md). The store listing text is in [docs/release/store-listing.md](docs/release/store-listing.md). Terms used in the code and docs are defined in [GLOSSARY.md](GLOSSARY.md).

## License

[MIT](LICENSE)
