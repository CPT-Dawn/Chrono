# Demo video

A 60-second film of Chrono, rendered at 3840×2160 and 60 fps. Chrome's listing takes it as a YouTube link (the "Promo video" field); Firefox Add-ons has no video field, so link it from the description or the homepage instead.

## How it's made

Nothing in it is a screen recording or a mock-up. The Panel is Chrono's own code, bundled from `src/` by `build.mjs` with the real time model behind it, sitting over the real watch-page capture from `../source/cap/`. A scripted cursor clicks its real buttons, so every digit roll, the sliding speed-table highlight, the expanding details and the target's "Applied" are the shipped animations.

- `stage.ts` plays YouTube's part: it answers the Panel's speed changes and targets the way `src/watch-page.ts` does. `browser-shim.ts` stands in for WXT's `browser.i18n` (from the real `messages.json`) and `storage`.
- `comp.html` is the frame: scenes, captions, the speed range, the end card.
- `director.js` is the timeline, camera and cursor.
- `virtual-time.js` makes the render deterministic. It replaces `Date`, `performance.now`, timers and `requestAnimationFrame` with one virtual clock, and pauses every Web Animation and CSS transition (shadow roots included) to advance it by exactly one frame per capture. The clock starts at 5:23:23 PM so the Panel reads "Ends 5:30 PM", as the captures do, and "Done by 5:30" needs exactly 1.75×, from which + steps cleanly through 2×, 2.25× … 3×.
- `record.mjs` steps the clock, captures each frame at 2× device pixels, and pipes them to ffmpeg (x264, CRF 12, BT.709).

| Time | Scene |
|---|---|
| 0–5 s | The mark draws itself: a timeline runs in and wraps into the clock ring. |
| 5–9 s | "A 15-minute video at 1.5×. When will you actually be done?" |
| 9–17 s | The watch page; the camera pushes into the Panel; + and − change speed. |
| 17–24 s | The details expand; clicking speed-table rows. |
| 24–31 s | A "Done by 5:30" target, "Needs 1.75×", Apply. |
| 31–38 s | + past 2× to 3×, with the speed range. |
| 38–43 s | Playlist summary and Playlist scope. |
| 43–48 s | The Player badge. |
| 48–53 s | No data collected. One permission. Open source. |
| 53–60 s | End card. |

## Rendering

Needs `playwright-core@1.64.1` reachable from this folder (a `node_modules` here, or a symlink to one; it's git-ignored), the Chromium from [real-browser-check](../../../agents/real-browser-check.md), ffmpeg, and Inter Display installed.

```sh
bun docs/release/assets/video/build.mjs
cd docs/release/assets/video
node record.mjs comp.html out/check --scale 1 --stills 3.5,14,27.5   # a few frames, quickly
node record.mjs comp.html out/chrono-demo-4k60.mp4                    # the film, ~3,600 frames
ffmpeg -i out/chrono-demo-4k60.mp4 -vf scale=1920:1080:flags=lanczos -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p -movflags +faststart out/chrono-demo-1080p60.mp4
```

Upload the 4K file to YouTube: YouTube gives 4K uploads a better codec at every resolution, 1080p included. The film is silent by design. Add music in YouTube Studio's editor from the YouTube Audio Library, which is licensed for exactly this. A calm, minimal piano or ambient track at about 90–110 BPM suits it.
