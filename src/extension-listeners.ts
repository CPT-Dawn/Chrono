/**
 * Removes a listener from an extension API event. When Chrono stops because the extension
 * was updated, disabled or removed, Chrome throws "Extension context invalidated." even
 * from removing a listener; that listener died with the extension, so there's nothing left
 * to remove.
 */
export function removeExtensionListener(remove: () => void): void {
  try {
    remove();
  } catch {
    // The extension's context is gone, and the listener with it.
  }
}
