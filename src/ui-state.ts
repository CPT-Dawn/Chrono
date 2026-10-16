// What Chrono remembers about how the viewer left its UI. Unlike settings, the viewer
// never sets these directly.

/** Whether the viewer left the Panel's details expanded. */
export const panelExpanded = storage.defineItem<boolean>('local:panelExpanded', { fallback: false });
