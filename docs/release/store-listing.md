# Store listing

Listing text and settings for the Chrome Web Store and Firefox Add-ons. The name and summary come from the manifest (`public/_locales/en/messages.json`); keep them in step. The images are in [assets/](assets/README.md).

Chrome's listing policy names repeating one keyword more than five times as keyword spam, so the description says "YouTube" three times and otherwise says "the video", "the player" or "the page".

## Name

Chrono – Finish Time & Speed for YouTube

## Summary

Chrome (manifest description, 132 characters at most):

See how long a YouTube video really takes at your speed, and when you'll finish.

Firefox Add-ons (250 characters at most):

See how long a video, chapter or playlist really takes at your speed, and the clock time you'll finish. Set a deadline and Chrono finds the speed, up to 4×. Built into the page, styled like it, and collects no data.

## Description (both stores)

Chrono shows how long a video really takes at your speed, and the moment you'll finish, right at the top of YouTube's sidebar.

A 40-minute lecture at 1.5× is 26 minutes 40. Chrono does that math for every video, chapter and playlist, keeps it live as you change speed, and turns it into a clock time: "Ends 3:45 PM".

What you get
• Finish time at a glance: the watch time left at your speed and when you'll be done, with speed − and + beside them.
• Every speed side by side: remaining and finish time from 0.25× to 4×. Click a row to switch.
• Chapters and playlists: the time left in the chapter you're in, or up to any entry in a playlist.
• Targets: have 45 minutes, or need to be done by 6 PM? Chrono works out the speed you need and applies it in one click.
• Past 2×: the player stops at 2×. Chrono's + keeps going in 0.25× steps up to 4×, and every estimate follows.
• Player badge: an optional "/ ends 3:45 PM" after the player's own time, in fullscreen too.
• Playlist totals: one line on playlist pages with the total length, the watch time at your speed, and how many entries are unavailable.

Made to fit in
• Looks like part of the page: same type, same shapes, light and dark theme, theater and fullscreen.
• Chrono's speed is the player's speed. Change it in either place.
• Pauses its estimates during ad breaks, and stays out of the way on live streams.
• Works in background tabs and as you move from video to video.
• Keyboard and screen-reader friendly, and respects reduced motion.
• 12- or 24-hour clock, or automatic.

Private by design
No analytics, no tracking, no account. Chrono's only permission is storage for your settings, and it runs only on www.youtube.com. It's open source under the MIT licence: https://github.com/CPT-Dawn/Chrono

Chrono is not affiliated with or endorsed by YouTube or Google.

## Screenshots

Upload in this order. Chrome takes five; Firefox takes all six, with the captions below (Firefox shows captions under each image; Chrome has no caption field).

| # | File | Firefox caption |
|---|---|---|
| 1 | `01-finish-time.png` | Remaining watch time and your finish time, at the top of the sidebar. |
| 2 | `02-every-speed.png` | Every speed side by side: watch time and finish time from 0.25× to 4×. |
| 3 | `03-targets.png` | Set a finish time or the time you have, and Chrono finds the speed. |
| 4 | `04-past-2x.png` | The + keeps going past 2×, up to 4×, and every estimate follows. |
| 5 | `05-playlists.png` | Playlist totals: content time, watch time at your speed, and finish time up to any entry. |
| 6 | `06-at-home.png` | Looks like part of the page, in light and dark, theater and fullscreen. Collects no data. (Firefox only) |

Promo images (Chrome only): `small-promo-440x280.png` and `marquee-1400x560.png`.

## Promo video

Chrome takes a YouTube link in the listing's "Promo video" field. Upload the 4K render from [assets/video/](assets/video/README.md) to YouTube (unlisted is fine), titled "Chrono – Finish Time & Speed for YouTube", and paste its link. Firefox Add-ons has no video field; link the video from the homepage instead.

## Categories and tags

- Chrome Web Store category: **Tools**. Chrono is a viewing utility; "Workflow & Planning" also fits the finish-time targets, but Tools is where people search for speed controls.
- Firefox Add-ons categories (two at most): **Photos, Music & Videos**, and nothing second unless the current list has a closer fit than "Other". A wrong second category dilutes the first.
- Firefox Add-ons tags: youtube, playback speed, video speed, watch time, playlist.

## Privacy declarations

- Privacy policy URL (both stores): https://chrono.cptdawn.dev/privacy
- Chrome Web Store: "This extension does not collect or use your data."
  - Single purpose: show watch time and finish times for YouTube videos at the viewer's speed.
  - `storage`: keeps the viewer's settings.
  - Host access to www.youtube.com: where Chrono shows its Panel, Player badge and Playlist summary.
  - Remote code: no.
- Firefox Add-ons: `data_collection_permissions: none` is declared in the manifest. Paste the privacy policy's text into the listing's privacy policy field.

## Platforms

- Firefox Add-ons: tick Firefox only and untick Android when uploading. Firefox for Android is served m.youtube.com, which Chrono doesn't support, so the manifest declares no `gecko_android`.

## Links

- Homepage: https://chrono.cptdawn.dev/
- Support: https://chrono.cptdawn.dev/help
- Support email (both stores): ping@cptdawn.dev
- Source: https://github.com/CPT-Dawn/Chrono

## Getting badged

- **Chrome Featured**: nominate through the One Stop Support form ("My item" → nominate for a Featured badge) once 3.x has been live for a few weeks and the rating has recovered. The reviewers weigh design, onboarding, privacy and permissions; lead with no data collected, `storage` as the only permission, a reviewable open-source build, and the native look.
- **Chrome Established Publisher**: verify the publisher identity in the developer dashboard and set chrono.cptdawn.dev as the item's official URL (verified in Google Search Console).
- **Firefox Recommended**: needs a public listing first. After a few months of active maintenance, email amo-featured@mozilla.org with the listing link and the case for it. Mozilla runs a security review before accepting, and keeps reviewing afterwards.
