// What Chrono couldn't recognise on the page it is on. The "Report it" link carries this
// as `failed`, so that a viewer's report says which part of YouTube's page changed. It
// holds failure labels only, never anything from the page itself (ADR-0002).
import type { FailureLabel, Reading } from '@/youtube/adapter';

const failed = new Set<FailureLabel>();

/** Notes whether the adapter could read `part` this time. */
export function noteReading(part: FailureLabel, reading: Reading<unknown>): void {
  if (reading.recognised) failed.delete(part);
  else failed.add(reading.failed);
}

/** The parts of the page Chrono couldn't recognise when it last read them. */
export function failedParts(): FailureLabel[] {
  return [...failed].sort();
}

/** Forgets everything, as when Chrono leaves the page. */
export function clearDiagnostics(): void {
  failed.clear();
}
