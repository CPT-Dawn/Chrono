# Chrono

A browser extension that tells YouTube viewers how long their video, chapter or playlist will really take at their playback speed, and what speed they need to finish by a given time.

## Time

**Content time**:
A length of video measured as YouTube shows it, independent of playback speed.
_Avoid_: Duration (when ambiguous), video time

**Speed**:
The playback rate applied to the video, written with a multiplication sign (e.g. 1.5×).
_Avoid_: Playback rate (in UI), rate, multiplier

**Watch time**:
Content time divided by speed: how long something actually takes the viewer in the real world.
_Avoid_: Real time, adjusted time

**Remaining**:
The watch time left in a scope at the current speed. "Remaining" in Chrono always means watch time, never content time.
_Avoid_: Time left (when it might mean content time), countdown

**Finish time**:
The clock time at which a scope will end: now plus its remaining.
_Avoid_: ETA, end time, "finishing at"

## Scopes

**Scope**:
The stretch of content a remaining, finish time or target applies to: one of Video, Chapter or Playlist.
_Avoid_: Section, card, mode

**Video scope**:
The video currently loaded in the player.

**Chapter scope**:
The chapter of the current video that contains the playhead. It exists only when the video has chapters.

**Playlist scope**:
The current video plus every following playlist entry up to and including the target entry.
_Avoid_: Queue

## Targets

**Target**:
A constraint the viewer sets on a scope: either a finish time to meet or a watch time available.
_Avoid_: Goal, custom target, deadline

**Required speed**:
The speed at which a scope's remaining meets its target, rounded up to YouTube's 0.05× steps so that it never misses it.
_Avoid_: Suggested speed, needed speed

**Speed table**:
The list of common speeds, each shown with the remaining and finish time a scope would have at that speed.
_Avoid_: Speed rows, details list

## Surfaces

**Panel**:
Chrono's collapsible sidebar block on the watch page, styled like YouTube's own sidebar panels. It holds every scope and the settings.
_Avoid_: Dashboard, overlay, container

**Player badge**:
The short finish time Chrono appends to the player's own time display. It is optional and hides itself whenever the player layout isn't recognised.
_Avoid_: Inline time, time-display injection

**Playlist summary**:
The one-line total that Chrono adds to a playlist page, covering the playlist's content time, its watch time at the viewer's speed, and how many entries are unavailable. It is unrelated to the playlist scope.
_Avoid_: Playlist total, playlist duration

**Ad break**:
A period during which YouTube plays an ad in the player. Chrono pauses its calculations for its duration.
