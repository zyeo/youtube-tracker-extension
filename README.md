# YouTube Tracker Chrome Extension

YouTube Tracker is a Chrome extension that measures focused time spent on YouTube and keeps a local history of daily usage. It tracks time by page type, shows live progress in the popup, and provides a small dashboard for recent trends.

## What it does

- Tracks focused YouTube time only when the active tab is a YouTube page in the focused Chrome window
- Stops counting YouTube browse pages after 30 seconds and paused watch pages immediately
- Categorizes time by page type such as watch pages, Shorts, and general browsing
- Stores daily stats and compact recent session history in `chrome.storage.local`
- Shows live status in the popup, including today's focused time and daily goal progress
- Supports a configurable daily goal and configurable local retention window
- Sends one notification per day when the daily goal is exceeded
- Provides a dashboard with charts and recent sessions

## Install as an unpacked extension

There is no build step.

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder: `youtube-tracker-extension`.
6. Pin the extension if you want quick popup access.

After loading:

- Click the extension icon to open the popup
- Open the extension options page to adjust daily goal minutes and retention days
- Use the popup's dashboard entry point to inspect charts and recent sessions

## Permissions

Manifest permissions:

- `storage`: saves daily stats, settings, notification state, and local session history in `chrome.storage.local`
- `tabs`: checks the active tab URL and active tab changes so tracking only counts the current YouTube tab
- `windows`: checks whether the Chrome window is focused so background or unfocused browsing is not counted as active time
- `alarms`: periodically commits active-session time and keeps daily stats current
- `notifications`: shows the once-per-day alert when the configured daily goal is exceeded

Host permissions:

- `*://youtube.com/*`
- `*://www.youtube.com/*`
- `*://m.youtube.com/*`

These host permissions are needed so the extension can observe supported YouTube pages and classify page activity correctly across desktop and mobile YouTube domains.

## Privacy and storage

All extension data is stored locally in `chrome.storage.local`.

- No backend or cloud sync
- No account connection
- No export flow
- No data sent off-device by this project

If you remove the extension or clear its local extension storage, the tracked data is lost.

## Development and test commands

Install dependencies if needed:

```sh
npm install
```

Run tests:

```sh
npm test
```

Current test command:

```sh
node --test
```

## Manual QA checklist

Use this checklist with the unpacked extension loaded in Chrome:

1. Open a normal YouTube watch page, keep that tab active in the focused Chrome window for a few minutes, and confirm the popup time increases.
2. Switch between a watch page, Shorts, and a general YouTube browsing page, then confirm the dashboard reflects page-type breakdowns.
3. Change focus away from Chrome or switch to a non-YouTube tab, wait briefly, and confirm tracked focused time stops increasing.
4. Leave a YouTube browse page open for more than 30 seconds and confirm tracked focused time stops increasing.
5. Pause a YouTube watch page and confirm tracked focused time stops increasing.
6. Play a YouTube watch page without interacting and confirm tracked focused time continues increasing while the video plays.
7. Open the options page, change daily goal minutes and retention days, reload the popup, and confirm the updated goal appears.
8. Set a very small daily goal, exceed it on YouTube, and confirm a notification appears only once for that day.
9. Open the dashboard and confirm charts render and recent session entries appear after tracked activity.
10. Reload the extension from `chrome://extensions/`, then confirm previously stored local stats still appear.

## Known limitations

- Chrome only; this repository is structured as a Chrome extension, not a cross-browser package
- Tracking is limited to `youtube.com`, `www.youtube.com`, and `m.youtube.com`
- Tracking depends on active tab, focused window, page type, and YouTube video signals, so some edge cases around rapid tab/window changes may be approximate
- Data is local only; there is no sync, backup, multi-device merge, or export
- Existing automated coverage is limited to Node-based tests and does not cover full browser integration behavior
