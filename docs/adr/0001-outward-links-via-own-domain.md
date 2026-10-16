# Outward links go through fixed chrono.cptdawn.dev URLs

Every link the extension opens goes to a fixed path on `chrono.cptdawn.dev`, never straight to a third party. That covers the welcome, what's-new, help, tip and goodbye pages, and the homepage. The site then redirects wherever it needs to (Ko-fi, a ticket form, and so on). A URL shipped inside a released version stays in users' browsers for as long as they keep that version, so the paths are a permanent contract. Swapping a donation or ticket provider must be a website change, not an extension release.

## Consequences

- The site must serve all of these paths before any version that links to them is published.
- Removing or renaming a path breaks every installed version that still links to it. Paths are only ever added.
