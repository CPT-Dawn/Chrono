# Speeds above YouTube's fastest

Chrono's − and + and its targets go up to 4×, though YouTube's player stops at 2×: its API clamps faster speeds to 2× and its menu ends there (Nov 2026, player 11a45ffb). Above 2×, Chrono puts the player at 2× and sets the speed on the player's video element itself, which plays it. YouTube's player keeps reporting 2× and puts its own speed back on the video whenever it loads another, so the page script remembers the speed and puts it back while the player still sits at 2×. Once the player leaves 2× (the viewer picked a speed in YouTube's menu or used Shift+< / Shift+>), the speed is YouTube's again and Chrono forgets its own.

Consequences, accepted because viewers ask for speeds above 2× and the video element plays them well:

- Above 2×, YouTube's menu reads 2×, not the real speed.
- Picking 2× in YouTube's menu, or holding for 2×, can't be told from YouTube putting 2× back, so it doesn't leave a faster speed; the viewer uses Chrono's − or another speed in YouTube's menu.
- The speed above 2× lasts for the page session: a reload, or a new tab, starts at YouTube's own remembered speed.
- In an ad break Chrono leaves the ad's speed alone, and puts its own back when the ad ends.
