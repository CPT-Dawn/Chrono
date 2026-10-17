// What Chrono couldn't recognise on the page it is on. The "Report it" link carries this
// as `failed`, so that a viewer's report says which part of YouTube's page changed. It
// holds failure labels only, never anything from the page itself (ADR-0002).
import type { FailureLabel, Reading } from '@/youtube/adapter';

const failed = new Set<FailureLabel>();

/** Notes whether the adapter could read `part` this time. */
export function noteReading(part: FailureLabel, reading: Reading<unknown>): void {
  if (reading.recognised) failed.delete(part);
  else failed.add(part);
}

/** The parts of the page Chrono couldn't recognise when it last read them. */
export function failedParts(): FailureLabel[] {
  return [...failed].sort();
}

/** The parts Chrono reads on a playlist page. It reads every other part on a watch page. */
const PLAYLIST_PAGE_PARTS: readonly FailureLabel[] = ['summary'];

/**
 * Forgets what Chrono couldn't recognise on one kind of page, as when it leaves that page.
 * Each page's lifecycle forgets only its own parts, so neither wipes the other's.
 */
export function clearDiagnostics(page: 'watch' | 'playlist'): void {
  for (const part of failed) {
    if (PLAYLIST_PAGE_PARTS.includes(part) === (page === 'playlist')) failed.delete(part);
  }
}
