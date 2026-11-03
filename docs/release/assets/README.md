# Store images

The Chrome Web Store and Firefox Add-ons images, and the sources they're drawn from. Upload order and Firefox captions are in [store-listing.md](../store-listing.md).

| File | Size | Store |
|---|---|---|
| `01-finish-time.png` … `05-playlists.png` | 1280×800 | both |
| `06-at-home.png` | 1280×800 | Firefox only (Chrome takes five) |
| `small-promo-440x280.png` | 440×280 | Chrome |
| `marquee-1400x560.png` | 1400×560 | Chrome |
| [The demo video](video/README.md) | 3840×2160, 60 fps | Chrome (as a YouTube link) |

## The look

The images extend [the UI's](../../design/ui-spec.md) restraint to the store: warm ink (`#0b0b0c`) or warm paper (`#f1efeb`), one red (`#ff0033`, the playhead), and Inter Display for headlines. Every image carries the mark's idea, a progress bar wrapped into a clock face: on the promo images as the hero, a timeline that runs in and curls into the ring; on the screenshots as a faint ring whose red playhead sits beside the UI. Dark and light screenshots alternate, so the set shows both themes without saying so.

The UI in them is real: captures of Chrono on live youtube.com, at 2× pixel density, never redrawn. The video and playlist are Blender Studio's open movies (Sintel; "Blender Open Movies"), which are CC-BY, so the listing shows no one else's content. Comments were hidden and the sidebar filtered to Blender videos before capturing.

## Redrawing

Each image is an HTML page in `source/`, rendered at 2× and downsampled with Lanczos to the exact store size.

1. Install `playwright-core@1.64.1` in a scratch directory and copy `source/render.mjs` there (see [real-browser-check](../../agents/real-browser-check.md) for the browser it drives). ImageMagick (`magick`) does the downsampling.
2. Render: `node render.mjs <repo>/docs/release/assets/source/01-finish-time.html 1280 800 <repo>/docs/release/assets/01-finish-time.png`. Use `440 280` for `tile.html` (small promo) and `1400 560` for `marquee.html`.

Inter Display is read from the system (`local()`); without it, the pages fall back to Inter, then the system font, and the headlines will set differently.

When the UI changes, recapture the surfaces in `source/cap/` the same way (Chrono on live youtube.com, @2x, Sintel paused near 3:38, speed 1.5× or 2.5×) under the same file names, and re-render. Each page crops its capture in CSS pixels in its `sheet(...)` call.
