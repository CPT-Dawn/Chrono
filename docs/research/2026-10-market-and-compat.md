# Market & compatibility research (2026-10-17)

## Chrono's own listing
- Chrome Web Store: 349 users, 4.2★ (19 ratings), v2.0.0 (Apr 24, 2026).
- Every negative review followed an update:
  - "…don't work at first time … you have reload YouTube video page for times to show up" (Feb 3, 2026, same symptom as GitHub #2).
  - "Changed for the worse -- no longer using" (Feb 13, 2026).
- Positive reviews (2024) are mostly about study scheduling: "Good For Scheduling study sessions!", "Helps with those last night study sessions."
- No explicit feature requests.

## Competitors
| Extension | Users | Browsers | Notable |
|---|---|---|---|
| Video Speed Controller | ~3M | Chrome only (no official Firefox) | 0.07–16×, shortcuts, per-site rules, remembers speed |
| Enhancer for YouTube | 2M Chrome / 597K Firefox | Chrome, Firefox, Edge | 16× speed, shortcuts, many tweaks |
| Improve YouTube! | ~400K | Chrome, Firefox, Edge, Opera | remaining-time option (broken by new player, code-charity/youtube#3403) |
| YouTube Time Remaining | ~1K | Chrome | wall-clock remaining |
| Playlist Duration Calculator / Analyzer | ~1–2K | Firefox / Chrome | playlist totals, often wrong |
| Per-channel speed tools (SpeedMemory etc.) | tiny | Chrome | per-channel speed |

None of these combines speed control, finish-at times, chapter and playlist remaining time, and a required speed to meet a deadline. That combination is the gap Chrono fills.

## User demand, strongest signal first
1. Keeps working through YouTube updates, and speed doesn't reset (videospeed #1324, #1521, #1262; Enhancer reviews on AMO).
2. Remembered default speed, per site or per channel (videospeed #287; ctrl.blog per-channel speed article).
3. Firefox builds (videospeed #1547; Enhancer users asking for parity).
4. Keyboard shortcuts, scroll-wheel speed, a reset-speed button (YouTube-Enhancer #599, #661; videospeed #1640, #1611).
5. Either support Shorts or stay out of their way (videospeed #1522, #1566).
6. Playlist / Watch Later totals shown on the page itself, and accurate.
7. Smaller signals:
   - speeds above 2×;
   - skip interval scaled to playback speed (videospeed #1627);
   - durations that account for SponsorBlock skips;
   - leaving YouTube's hold-for-2× working (videospeed #1554, #1568).

Reddit could not be fetched.

## YouTube DOM changes that break extensions (2025–2026)
- **"Delhi" player redesign**
  - Rolled out in A/B waves from Oct 2025, so different users get different DOMs.
  - New classes: `ytp-delhi-modern`, `ytp-fullscreen-grid`, `ytp-fullscreen-quick-actions`.
  - Broke control-bar and time-display injections in several extensions.
- **`yt-lockup-view-model`** is replacing the older `ytd-*-renderer` elements. The two are mixed on the same page, so an unscoped query double-counts (imsoumya18/yt_utility#1).
- **Obfuscated CSS variables** since Mar 2026: `--yt-spec-*` became names like `--t4a6da19e16bf221a`. Don't depend on YouTube's CSS variables (youtube-ambilight#310).
- **Late rendering.** Buttons only appear after a reload (YouTube-Enhancer#1037), matching Chrono's own bug.

## Publishing
- **Firefox AMO**
  - Free. Needs `browser_specific_settings.gecko.id`.
  - New add-ons must declare `gecko.data_collection_permissions` (e.g. `{"required":["none"]}`).
  - Firefox has no `service_worker`; declare `background.scripts` alongside it. Chrome 121+ and Firefox 121+ each ignore the key meant for the other.
  - Host permissions are granted at install only from Firefox 127, and users can revoke them.
  - Object-valued `CustomEvent.detail` gets hidden by Firefox's Xray boundary between page and content-script worlds, so serialise it.
- **Edge Add-ons:** free, through Partner Center.
- **Opera:** reviews are slow (weeks to months).
- **Safari:** needs Xcode, `safari-web-extension-packager` and an Apple Developer account.
- **Mobile:** Kiwi was discontinued (Jan 2025). Firefox for Android is the realistic mobile target; it needs a `gecko_android` entry.

Full source links are in the research hand-back in the session that produced this; the issue numbers above are their primary references.
