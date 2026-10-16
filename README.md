# ⏱️ YouTube Time Manager

> **Because life's too short to watch 2-hour tutorials at 1x speed** ⚡

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Extension-blue?style=for-the-badge&logo=google-chrome)](https://chromewebstore.google.com/detail/youtube-playback-speed-fi/albpnoibahehboglkghilhljilchnfbo)
[![Version](https://img.shields.io/badge/version-2.0.0-green?style=for-the-badge)](https://github.com/yourusername/youtube-time-manager)
[![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)](LICENSE)

A powerful Chrome extension that transforms your YouTube watching experience with advanced time management, intelligent speed controls, and a sleek, customizable interface. Say goodbye to video time anxiety and hello to productivity! ✨

---

## 🎯 What Does It Do?

Ever wondered "When will this video actually end?" or "How long until I finish this playlist?" **YouTube Time Manager** answers these questions and more with style. It's your personal YouTube assistant that helps you:

- 📊 **Track Time Like a Pro**: See exactly when your video, chapter, or entire playlist will finish
- ⚡ **Speed Control Mastery**: One-click speed changes with beautiful interactive rows
- 🎯 **Custom Targets**: Set specific finish times or durations - "I need to be done by 3 PM!"
- ☕ **Ad Break Entertainment**: Enjoy a relaxing coffee animation while ads play (because ads fund free content!)
- 🎨 **Personalize Everything**: Toggle cards, choose themes, customize your dashboard

Think of it as a **fitness tracker for your YouTube habits**, but way more stylish.

---

## ✨ Features That'll Make You Go "Wow!"

### 🕐 Flip Clock Display
A gorgeous, animated flip clock showing real-time countdown. Watching it update is oddly satisfying (we won't judge if you just stare at it for a minute).

### 📹 Triple Threat Tracking
- **Video Section**: Remaining time, finish time, progress bar
- **Chapter Section**: Smart chapter detection with per-chapter tracking
- **Playlist Section**: Total playlist time, videos remaining, overall progress

### 🎛️ Speed Control on Steroids
- **Interactive Speed Rows**: Click any speed (1x - 2x) to instantly apply it
- **Hover Effects**: Buttery-smooth animations that feel premium
- **Active Highlighting**: Always know your current speed
- **Quick Controls**: ± buttons in header for rapid adjustments

### 🎯 Custom Target System
Want to finish by 3 PM? Need to watch 45 minutes of content? Set custom targets for:
- **Target Duration**: "I have exactly 30 minutes"
- **Target Finish Time**: "I need to be done by 2:30 PM"
- **Auto-calculations**: Instantly see required playback speed

### ☕ Delightful Ad Break Card
Because ads are inevitable, we made them entertaining:
- Animated coffee cup that fills and empties
- Rotating humorous messages ("Perfect time for a stretch! 🧘")
- Smooth card transitions
- Your time tracking pauses during ads

### 🎨 Customization Galore
**Settings Panel** with organized sections:
- **Time Format**: 12h or 24h display
- **Appearance**: Glassmorphism (default) or Solid YouTube Black
- **Display Options**: Toggle individual cards on/off
- **Compact Mode**: Auto-collapses when all cards hidden

### � Intelligent Features
- **Smart Chapter Detection**: Multiple detection methods for maximum reliability
- **Playlist Intelligence**: Tracks current position, calculates remaining time
- **Auto-Updates**: Real-time updates every 100ms
- **Navigation Handling**: Survives YouTube's SPA navigation

---

## 🚀 Installation

### From Chrome Web Store (Recommended)
1. Visit the [Chrome Web Store](https://chromewebstore.google.com/detail/youtube-playback-speed-fi/albpnoibahehboglkghilhljilchnfbo)
2. Click **"Add to Chrome"**
3. Profit! 🎉

### Manual Installation (For Developers)
See [Development](#development) below to build Chrono and load it unpacked.

---

## � How to Use

### Basic Usage (aka The "I Just Want It to Work" Guide)

1. **Go to any YouTube video**
   - The extension automatically injects a beautiful dashboard below the video

2. **Watch the magic happen**
   - Flip clock shows current time
   - Video section displays remaining time and finish time
   - If the video has chapters, you'll see chapter tracking too
   - In a playlist? Playlist section appears automatically!

3. **Change speed like a boss**
   - Click any speed row in the details panel
   - Or use the ± buttons in the header
   - Speed updates instantly, UI updates automatically

### Pro Tips 🎓

**Want to finish by a specific time?**
```
1. Open any section's details panel
2. Enter your target finish time (e.g., "3:30 PM")
3. See the required speed instantly
4. Click that speed row to apply it
```

**Binge-watching a playlist?**
```
1. Open playlist section
2. Set target video (e.g., watch first 10 videos)
3. See total time remaining
4. Adjust speed to fit your schedule
```

**Minimalist mode?**
```
1. Click settings gear icon
2. Toggle off unwanted cards
3. Enjoy a clean, compact interface
```

**Light mode YouTube user?**
```
1. Open settings
2. Enable "Solid Background"
3. Get perfect contrast with YouTube's light theme
```

---

## 🎨 Visual Showcase

### The Dashboard
```
┌─────────────────────────────────────────┐
│  1.5x     [Clock: 02:45:30]     ⚙️   │  ← Header
├─────────────────────────────────────────┤
│ � Video                          ▓▓▓░  │  ← Video card
│  Remaining: 15:30 | Finish: 3:15 PM    │
│  [Interactive speed rows: 1x-2x]       │
├─────────────────────────────────────────┤
│ � Chapter                        ▓▓░░  │  ← Chapter card
│  Chapter 3 of 8: Introduction          │
│  [Speed options with hover effects]    │
├─────────────────────────────────────────┤
│ 🎬 Playlist                       ▓░░░  │  ← Playlist card
│  Video 5/20 | 2h 15m remaining         │
└─────────────────────────────────────────┘
```

### During Ads
```
┌─────────────────────────────────────────┐
│         ☕                              │
│    [Coffee cup animation]               │
│                                         │
│         Ad Break                        │
│  "Grabbing some popcorn 🍿"            │
│  Your time tracking will resume shortly │
└─────────────────────────────────────────┘
```

---

## ⚙️ Settings Deep Dive

### Time Format
- **12-Hour**: 3:45 PM (for humans)
- **24-Hour**: 15:45 (for developers)

### Appearance
- **Glassmorphism** ✨: Semi-transparent with blur (default, looks magical)
- **Solid Background** 🎨: YouTube black (#0f0f0f, perfect for light mode)

### Display Options
- **Show Video Card**: Toggle video section on/off
- **Show Chapter Card**: Hide chapters if you don't care
- **Show Playlist Card**: Remove playlist tracking

### Compact Mode (Automatic)
When all cards are hidden:
- Container shrinks to header-only
- No wasted space
- Settings still fully functional

---

## Development

Chrono is built with [WXT](https://wxt.dev), TypeScript and Vitest, and targets Chrome 121+ and Firefox 128+ on desktop. You need Node.js 22.18 or later.

```bash
npm install
npm test               # run the tests
npm run typecheck
npm run build          # Chrome build in .output/chrome-mv3
npm run build:firefox  # Firefox build in .output/firefox-mv3
npm run dev            # Chrome with live reload (dev:firefox for Firefox)
```

To load a build by hand:
- **Chrome:** open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick `.output/chrome-mv3`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `.output/firefox-mv3/manifest.json`.

Everything that reads YouTube's page lives in `src/youtube/adapter.ts`. Words and terms follow [`GLOSSARY.md`](GLOSSARY.md).

### Adding a saved YouTube page

The tests run Chrono on real YouTube pages saved in `tests/pages/`. When YouTube changes something, save a page that shows the change, write a test that fails on it, then fix the adapter.

1. Open the page in a private window, signed out, and let it finish loading. Get it into the state you want to test (playlist open, ad playing, and so on).
2. In the DevTools console, run `copy('<!DOCTYPE html>\n' + document.documentElement.outerHTML)` and paste the result into a file. Don't use "Save Page As": it saves the page before YouTube has rendered it.
3. Trim it into `tests/pages/`, naming it after what it shows (e.g. `watch-delhi` is a watch page with the Delhi player):
   ```bash
   npm run trim-page -- ~/Downloads/raw.html tests/pages/<name>.html
   ```
   This removes scripts, styles and icons, plus anything personal: the account menu, subscriptions, comments and live chat. It also keeps only the first three related videos. Read the diff before committing anyway.
4. Load it in a test with `openSavedPage('<name>', '<the page URL>')` from `tests/harness/youtube.ts`.

---

## � Known Issues & Limitations

### The "Not Really Issues" Issues
1. **YouTube Changes Layout**: YouTube updates their site often. We adapt, but there might be 24h where things look wonky.
2. **Livestreams**: Time estimation on live content is... creative. We're working on it!
3. **Ad Blocker Conflicts**: If you block ads, the ad card won't show. That's... expected?

### Actual Limitations
- Chapter detection depends on YouTube's page structure
- Playlist calculations assume linear watching
- Time estimates don't account for buffering (we're not psychic)

**Found a bug?** [Report it here](https://github.com/yourusername/youtube-time-manager/issues) with:
- What happened
- What you expected
- Screenshots (bonus points!)
- Your browser version

---

## 🤝 Contributing

We love contributions! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/AmazingFeature`)
3. **Commit** your changes (`git commit -m 'Add some AmazingFeature'`)
4. **Push** to the branch (`git push origin feature/AmazingFeature`)
5. **Open** a Pull Request

### Ideas for Contributions
- 🌐 Internationalization (i18n)
- 🎨 More themes
- 📊 Watch history analytics
- ⌨️ Keyboard shortcuts
- 🎮 More speed presets
- 📱 Mobile optimization (for Kiwi Browser)

---

## � License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**TL;DR**: Do whatever you want with it, just don't sue us. ❤️

---

## � Acknowledgments

- **YouTube**: For building a platform that needs extensions like this
- **Coffee**: For fueling late-night coding sessions
- **You**: For using this extension and making it worthwhile

---

## 💖 Support the Project

If this extension saved you time (literally), consider:

- ⭐ **Starring** this repository
- 💬 **Leaving a review** on Chrome Web Store
- 🐛 **Reporting bugs** you find
- 💡 **Suggesting features** you'd love
- ☕ **Buying me a coffee** (coming soon!)

---

## 📞 Contact & Links

- 🌐 **Website**: [Coming Soon]
- 📧 **Email**: [your-email@example.com]
- 💻 **GitHub**: [@yourusername](https://github.com/yourusername)
- 🐦 **Twitter**: [@yourusername](https://twitter.com/yourusername)

---

## 🎭 Fun Facts

- This extension has **1800+ lines** of JavaScript love
- The flip clock animation took **3 hours** to perfect
- **Coffee cup animation**: 47 lines of CSS, 100% organic
- The settings panel has **5 sections** of pure customization
- **Ad messages rotate** every 3 seconds (there are 7 of them)
- Total **development time**: Too many coffees to count ☕

---

## 📚 Version History

### v2.0.0 (Current)
- ✨ Complete redesign with modern UI
- ⚡ Interactive speed rows with click functionality
- ☕ Ad break card with coffee animation
- 🎨 Theme toggle and card visibility settings
- 📦 Compact mode for minimalists

### v1.x
- 🏗️ Initial release
- ⏱️ Basic time tracking
- 🎯 Speed controls

---

<div align="center">

**Made with ❤️, ☕, and way too many YouTube tutorials**

[⬆ Back to Top](#️-youtube-time-manager)

</div>