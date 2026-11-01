# Chrono looks like YouTube, not like Chrono

Chrono's v3 UI had its own design system: a "dawn" palette (indigo, rose and amber), gradient progress bars, Sora in the popup, and springy scale animations. Side by side with live YouTube, this read as an extension bolted onto the page. YouTube is monochrome (grey plus inverse black/white), colours only progress and links, and barely animates.

We adopt YouTube's own design language instead. Chrono copies YouTube's measured tokens and components, uses YouTube's progress red as its only colour, adds motion only where it answers something the viewer did, and puts its brand in one place, the ⋮ menu's header. The details are in [the UI spec](../design/ui-spec.md).

## Consequences

- The tokens are Chrono's own copies of YouTube's values, never YouTube's obfuscated CSS variables, so they need re-measuring when YouTube restyles (as the neutrals always did).
- The app icon stays Chrono's own mark, a clock ring ending in a red playhead. It doesn't use YouTube's logo, play button or name, so it can't be mistaken for a YouTube product.
- There's no motion library: the Web Animations API with `linear()` spring easings does it at 0kB.
