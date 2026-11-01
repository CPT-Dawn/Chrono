# Chrono UI spec

How Chrono looks, moves and reads. The goal is a feature the YouTube team could have shipped: it borrows YouTube's own tokens, components and restraint, and adds polish only where the viewer acts. Measured from live youtube.com on 2 Nov 2026 (Delhi player, both themes). The decision is recorded in [ADR-0003](../adr/0003-native-youtube-design-language.md).

## Principles

1. **Monochrome by default.** YouTube is grey plus inverse black/white. Colour means something: YouTube's progress red marks progress and the playhead, blue marks a link, and nothing else is coloured. No gradients, glows, tinted shadows or custom fonts.
2. **Speak in content, not chrome.** The Panel leads with the answer ("12:30 left", "Ends 3:45 PM"), not with Chrono's name. The brand appears once: in the ⋮ menu's header.
3. **YouTube's components, not lookalikes.** The speed control is YouTube's segmented pill (like/dislike). The primary action is YouTube's inverse pill (Subscribe). Menus, list rows, chips and switches copy YouTube's measurements.
4. **Quiet motion, precise feedback.** YouTube's page barely animates. Chrono animates only what answers the viewer: expanding, a speed changing, a menu opening, a target resolving. Nothing bounces or overshoots, and nothing loops. Every animation respects `prefers-reduced-motion`.
5. **Dense and calm.** Fewer lines and less ink. Secondary information is secondary grey at 12–14px. Rows line up on shared columns.

## Tokens

Never read YouTube's CSS variables: they're obfuscated and change with every build. These are Chrono's own copies. The Panel switches on `:host([data-theme='dark'])`. The popup isn't on YouTube, so it follows `prefers-color-scheme`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--text` | #0f0f0f | #f1f1f1 | primary text, icons |
| `--text-secondary` | #606060 | #aaaaaa | metadata, labels, finish times |
| `--text-disabled` | #909090 | #717171 | disabled controls |
| `--surface` | #ffffff | #212121 | raised surface (popup cards, never the Panel) |
| `--menu` | #ffffff | #282828 | menus, popovers |
| `--tonal` | rgba(0,0,0,.05) | rgba(255,255,255,.1) | tonal buttons, selected rows, chips, inputs |
| `--tonal-hover` | rgba(0,0,0,.1) | rgba(255,255,255,.2) | hover on tonal things; hover on bare rows uses `--tonal` |
| `--outline` | rgba(0,0,0,.1) | rgba(255,255,255,.2) | Panel border, dividers, input borders |
| `--inverse` | #0f0f0f | #f1f1f1 | primary action fill, selected chip |
| `--on-inverse` | #ffffff | #0f0f0f | text on inverse |
| `--inverse-hover` | #272727 | #d9d9d9 | |
| `--press` | rgba(0,0,0,.1) | rgba(255,255,255,.1) | touch feedback overlay |
| `--link` | #065fd4 | #3ea6ff | focus ring, links |
| `--progress` | linear-gradient(90deg, #ff0033 80%, #ff2791) | same | played progress, as YouTube's own bar |
| `--playhead` | #ff0033 | #ff0033 | the mark's dot, the progress head |
| `--caution` | #606060 text + CAUTION icon | #aaaaaa | a target YouTube can't meet: worded, not coloured |
| `--live` | #ff4e45 | #ff4e45 | Live dot only |
| `--menu-shadow` | 0 4px 32px rgba(0,0,0,.1) | 0 4px 32px rgba(0,0,0,.4) | menus only |

Typography: `font-family: Roboto, Arial, sans-serif`, loaded by YouTube (400/500/700). The popup bundles Roboto (`@fontsource/roboto`, latin, 400/500/700) and drops Sora. Numbers are always `font-variant-numeric: tabular-nums`.

| Style | size/line-height | weight | Use |
|---|---|---|---|
| headline | 20/28 | 700 | the Panel's remaining |
| title | 16/22 | 500 | a scope's heading ("Chapter", "Playlist") |
| body | 14/20 | 400 | rows, menu items, inputs |
| label | 14/20 | 500 | buttons, the speed readout, selected rows |
| caption | 12/18 | 400 | finish lines, notes, menu section headings |

Shape: the Panel and menus use a 12px radius, rows and inputs 8px, chips 8px, and buttons and the speed pill are full pills. Icon buttons are 40×40 circles (36×36 inside the speed pill); icons are 24px, 20px in rows and menus.

Spacing: a 4px grid. The Panel pads 12px 16px, sections are 16px apart, and rows pad 8px 12px. The Panel keeps a 16px gap below it, as YouTube does between sidebar items.

## Motion

Material 3 tokens, which YouTube's web app uses. Durations are short: the viewer is watching a video.

| Token | Value |
|---|---|
| `--ease-standard` | cubic-bezier(0.2, 0, 0, 1) |
| `--ease-decelerate` | cubic-bezier(0.05, 0.7, 0.1, 1) (emphasized decelerate: things entering) |
| `--ease-accelerate` | cubic-bezier(0.3, 0, 0.8, 0.15) (emphasized accelerate: things leaving) |
| `--spring` | Material 3 Expressive's effects spring (damping 1.0, no overshoot) as `linear()`: `linear(0, 0.004 1%, 0.019 2.2%, 0.079 5%, 0.161 7.8%, 0.464 17%, 0.557 20.2%, 0.637 23.5%, 0.706 26.8%, 0.767 30.2%, 0.817 33.8%, 0.860 37.5%, 0.899 42%, 0.929 46.8%, 0.953 52.2%, 0.971 58.5%, 0.991 73.8%, 1)` |
| durations | 100 (hover, press), 150 (crossfades, exit), 200 (menu, chevron, chips), 300 (expand, indicator slides) |

Interactions:

| What | How |
|---|---|
| Hover | background to `--tonal`/`--tonal-hover` in 100ms `standard`, back in 150ms. |
| Press | a `--press` overlay fades in at 50ms and out at 200ms (YouTube's touch feedback). No scaling. |
| Focus | 2px `--link` outline, 2px offset, `:focus-visible` only. |
| Panel appears | a fade only, opacity 0→1 over 200ms. It never slides: it shares the sidebar with YouTube's content. |
| Details expand | a `grid-template-rows: 0fr→1fr` transition, 300ms `decelerate`. Contents fade in 150ms and rise 4px, staggered 30ms per section. Collapsing takes 200ms `accelerate` with no stagger. The chevron turns 180° in 200ms `standard`. |
| Speed changes | the readout's changed digits roll in the direction of change (new up from below when faster), 250ms `--spring`, and the remaining's digits roll with them. The selected row's highlight in the speed table slides to the new row (FLIP), 300ms `--spring`. Ticking seconds never roll: they change in place. |
| Menu | opens in 150ms `decelerate`, opacity 0→1 and scale .96→1 from the corner nearest its button; closes in 100ms `accelerate`, fading only. A check or switch changes in 150ms. |
| Target result | the required speed crossfades in 150ms. The Apply button fades and scales in from .9 in 200ms `decelerate`. After Apply, the result reads "Applied" for 1.2s. |
| Mark | the playhead dot travels once round the ring the first time the Panel appears in a page session, 900ms `decelerate` (the brand moment, in the menu header and popup only). |
| Reduced motion | movement and scale become instant; opacity fades are capped at 100ms. |

Mechanics: CSS transitions where state is a class or attribute, and the Web Animations API (`element.animate`) for one-shot motion such as digit rolls, FLIP and menu exits. No motion library: WAAPI plus `linear()` springs costs 0kB, and the browser runs the animations off the main thread. Avoid `interpolate-size`/`calc-size()`, View Transitions, anchor positioning and `::details-content`: Firefox 140 lacks them. `@starting-style` and `linear()` are fine.

## Surfaces

### Panel (watch-page sidebar)

An outlined block (1px `--outline`, 12px radius, transparent background), sitting directly on the page background like YouTube's engagement panels.

Collapsed: one row.

```
┌──────────────────────────────────────────────────────┐
│ 12:30 left                    ( −  1.5×  + )  ⌄   ⋮  │
│ Ends 3:45 PM · at 1.5×                               │
│ ━━━━━━━━━━━━━━━━━●───────────────────────────────── │  ← 3px progress, inset 16px
└──────────────────────────────────────────────────────┘
```

- **Remaining:** headline style. **Finish line:** caption style, `--text-secondary`.
- **Speed pill:** one tonal pill, 36px high, with − | readout | + and hairline dividers between them, as YouTube's like/dislike pill does. The readout is `label` style with a 44px minimum width. Each half takes its own hover and press.
- **Chevron:** the Details toggle. **⋮:** the menu. Both are 40px circles.
- **Whole row:** clicking anywhere outside the buttons toggles the details, as YouTube's description box does. Its hover is a `--tonal` wash over the whole Panel.
- **Progress:** 3px, track `--tonal-hover`, played `--progress`, no glowing head. On hover it grows to 5px over 100ms, as YouTube's bar does.
- **Live:** "Live" with a static `--live` dot. **Ad break:** "Paused for ad" in secondary text. Neither pulses.

Expanded: a 1px `--outline` divider under the row, then the sections.

- **Video:** its target, then its speed table.
- **Chapter:** a header row with the CHAPTERS icon and the `title`-style label "Chapter", then the chapter title in body text (one line, ellipsis), then its times in the headline row's layout at 16/22 500, a 3px progress bar, its target and its speed table.
- **Playlist:** the same layout, with the PLAYLIST icon, notes as caption text, and "Up to video" as an inline field.

**Speed table:** list rows 40px high in three columns: speed (label style), remaining (body), and finish (caption, secondary, right-aligned). The current row has a `--tonal` background and 500 weight, and that highlight is one element that slides between rows. Hover is `--tonal` on other rows. Drop the comparison bars: they were ink without information that the remaining column doesn't already give.

**Target:** a target row with a select chip and its fields. The select is styled as YouTube's "Sort by" chip: tonal, 32px high, 8px radius, label 14/20 500, a CHEVRON icon. It stays a native `<select>` for keyboard and screen-reader behaviour. Number fields are 32px, `--tonal` fill, 8px radius and borderless; on focus they get a 2px `--link` ring, and when invalid a 2px `--live` ring. The result row reads "Needs 1.35×" in label style, with the **Apply** inverse pill (32px high, padding 0 16px, label style) at its end. When YouTube can't play the speed, it shows the CAUTION icon and the message in secondary text, with no Apply button.

**⋮ menu:** rendered in the top layer with the Popover API (`popover="manual"`), so YouTube's playlist panel and masthead can't cover it. It is positioned under its button, right-aligned, and repositioned on scroll and resize while open. `--menu` background, 12px radius, `--menu-shadow`, 8px vertical padding, minimum width 240px.
- **Header:** the mark (20px) and "Chrono" (label style), 40px high, not focusable.
- **Choice group (clock format):** a caption-style section heading, then rows that carry a CHECK icon when chosen.
- **On/off items:** a row with the label and a YouTube-style switch at its end (36×20 track, 16px knob, on = `--inverse` track with `--on-inverse` knob). The role stays `menuitemcheckbox`.
- **Link items:** the icon, then the label.
- **Rows:** 40px high, padding 0 16px, a 16px icon-to-text gap, hover `--tonal`. Dividers are `--outline` with 8px vertical margin.

### Player badge

`· ends 3:45 PM` becomes ` / ends 3:45 PM`, matching YouTube's own separator in the time pill. It inherits the time display's font and colour at weight 400, so it doesn't take the current time's 500. No animation beyond a 150ms crossfade when the minute changes.

### Playlist summary

One more line of YouTube's playlist stats: inherited font and colour at their own opacity (`opacity` inherited, no pure white), with the monochrome mark (14px, currentColor; the playhead dot keeps its red). It fades in over 200ms.

### Toolbar popup (360px wide)

Chrono's own space, still in YouTube's language. It uses the page background (#fff / #0f0f0f) and bundled Roboto.

- **Header:** the 32px app icon (the rounded-square mark), "Chrono" (16/22 500) and the note (caption, secondary).
- **Settings:** a list of 48px rows: the label on the left and a switch on the right (the same switch as the menu). Clock format is a row of three chips (32px, 8px radius, tonal; the chosen chip is inverse), as YouTube's chip bar. The controls stay real checkboxes and radios.
- **Links:** menu-style rows at the bottom, behind a divider, each with its icon.
- No radial glow, no horizon line, no segmented control.

## Icons

`src/icons.ts`: a 24-unit grid, a 2-unit line with round caps and joins, and `currentColor`. The mark is a progress ring around clock hands, ending at a red playhead dot.

App icon: the mark in white on a #0f0f0f rounded square (radius 5.5/24), with the red playhead. Its source is `icons/chrono.svg`. The PNGs at 16, 32, 48 and 128 are generated from it, and the 16px version is hand-tuned so its strokes sit on whole pixels. Firefox also gets the SVG, plus `theme_icons` toolbar variants: a dark glyph for light toolbars and a light glyph for dark ones.
