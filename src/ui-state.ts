// What Chrono remembers about how the viewer left its UI. Unlike settings, the viewer
// never sets these directly.

/**
 * Whether the viewer left the Panel's details expanded, or null when they haven't toggled
 * them since choosing how the Panel starts.
 */
export const panelExpanded = storage.defineItem<boolean | null>('local:panelExpanded', { fallback: null });
