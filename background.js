// background.js - YouTube Tracker (Manifest V3 service worker)
// Listens for tab updates/activation and logs basic info for YouTube URLs.

// Storage keys for the first real metric.
const STORAGE_KEYS = {
  count: "youtubeOpenCount",
  time: "activeYouTubeTimeMs",
  shortsTime: "shortsFocusedTimeMs",
  watchTime: "watchFocusedTimeMs",
  browseTime: "browseFocusedTimeMs",
  date: "youtubeOpenDate"
};

/**
 * Determine YouTube page type based on URL.
 * - "shorts" for youtube.com/shorts/*
 * - "watch" for youtube.com/watch*
 * - "browse" for other youtube.com pages (home, subscriptions, search, etc.)
 * - null for non-YouTube URLs
 * @param {string} url
 * @returns {"shorts" | "watch" | "browse" | null}
 */
function getYouTubePageType(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "";
    const path = parsed.pathname || "";

    // Check YouTube host
    const isYouTubeHost =
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com";

    if (!isYouTubeHost) {
      return null;
    }

    // Shorts: /shorts/...
    if (path.startsWith("/shorts/")) {
      return "shorts";
    }

    // Regular watch page: /watch
    if (path.startsWith("/watch")) {
      return "watch";
    }

    // Other YouTube pages (home, subscriptions, search, etc.)
    return "browse";
  } catch (e) {
    // If URL parsing fails, treat as non-YouTube
    return null;
  }
}

/**
 * Format today's date as YYYY-MM-DD in local time.
 * @returns {string}
 */
function getTodayDateString() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Promise wrappers for chrome.storage.local (keeps code readable).
 */
function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

/**
 * Log information about the active YouTube tab to the console.
 * For now this only logs and does not store any analytics.
 * @param {chrome.tabs.Tab} tab
 */
function logYouTubeTab(tab) {
  if (!tab || !tab.url) return;

  const pageType = getYouTubePageType(tab.url);

  if (!pageType) {
    return;
  }

  console.log("[YouTube Tracker] Active YouTube tab detected:", {
    url: tab.url,
    pageType
  });
}

/**
 * Increment youtubeOpenCount for "today", automatically resetting on day change.
 * This is the first real metric: "YouTube opens today".
 * @param {{url: string, pageType: string, reason: string}} details
 */
async function incrementYouTubeOpensToday(details) {
  const { today, youtubeOpenCount } = await ensureTodayDailyMetrics();
  const nextCount = youtubeOpenCount + 1;

  await storageSet({
    [STORAGE_KEYS.date]: today,
    [STORAGE_KEYS.count]: nextCount
  });

  console.log("[YouTube Tracker] Counted a YouTube open.", {
    today,
    count: nextCount,
    reason: details.reason,
    url: details.url,
    pageType: details.pageType
  });
}

/**
 * Ensure the stored "daily metrics" keys match today's date.
 * If not, reset both:
 * - youtubeOpenCount
 * - activeYouTubeTimeMs
 * - shortsFocusedTimeMs
 * - watchFocusedTimeMs
 * - browseFocusedTimeMs
 *
 * @returns {Promise<{
 *   today: string,
 *   youtubeOpenCount: number,
 *   activeYouTubeTimeMs: number,
 *   shortsFocusedTimeMs: number,
 *   watchFocusedTimeMs: number,
 *   browseFocusedTimeMs: number
 * }>}
 */
async function ensureTodayDailyMetrics() {
  const today = getTodayDateString();
  const stored = await storageGet([
    STORAGE_KEYS.count,
    STORAGE_KEYS.time,
    STORAGE_KEYS.shortsTime,
    STORAGE_KEYS.watchTime,
    STORAGE_KEYS.browseTime,
    STORAGE_KEYS.date
  ]);

  const storedDate = stored[STORAGE_KEYS.date];
  let youtubeOpenCount = Number(stored[STORAGE_KEYS.count] ?? 0);
  let activeYouTubeTimeMs = Number(stored[STORAGE_KEYS.time] ?? 0);
  let shortsFocusedTimeMs = Number(stored[STORAGE_KEYS.shortsTime] ?? 0);
  let watchFocusedTimeMs = Number(stored[STORAGE_KEYS.watchTime] ?? 0);
  let browseFocusedTimeMs = Number(stored[STORAGE_KEYS.browseTime] ?? 0);

  // If the stored date isn't today, reset for the new day.
  if (storedDate !== today) {
    console.log("[YouTube Tracker] New day detected. Resetting metrics.", {
      storedDate,
      today
    });
    youtubeOpenCount = 0;
    activeYouTubeTimeMs = 0;
    shortsFocusedTimeMs = 0;
    watchFocusedTimeMs = 0;
    browseFocusedTimeMs = 0;

    await storageSet({
      [STORAGE_KEYS.date]: today,
      [STORAGE_KEYS.count]: youtubeOpenCount,
      [STORAGE_KEYS.time]: activeYouTubeTimeMs,
      [STORAGE_KEYS.shortsTime]: shortsFocusedTimeMs,
      [STORAGE_KEYS.watchTime]: watchFocusedTimeMs,
      [STORAGE_KEYS.browseTime]: browseFocusedTimeMs
    });
  }

  return {
    today,
    youtubeOpenCount,
    activeYouTubeTimeMs,
    shortsFocusedTimeMs,
    watchFocusedTimeMs,
    browseFocusedTimeMs
  };
}

// --- State tracking to enforce counting rules ---
// Only count when moving from a non-YouTube active tab to a YouTube active tab.
// Do NOT count switching between two YouTube tabs.
const lastActiveIsYouTubeByWindowId = new Map(); // windowId -> boolean
const isYouTubeByTabId = new Map(); // tabId -> boolean (best-effort, updated on tab updates)

/**
 * Returns whether a tab is a YouTube page (any YouTube page type).
 * @param {chrome.tabs.Tab} tab
 * @returns {{isYouTube: boolean, pageType: ("shorts"|"watch"|"browse"|null)}}
 */
function classifyTab(tab) {
  const pageType = tab && tab.url ? getYouTubePageType(tab.url) : null;
  return { isYouTube: Boolean(pageType), pageType };
}

// Listen for tab updates (URL changes, page loads, etc.).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act when the URL has changed or the page is fully loaded.
  if (changeInfo.status === "complete" || changeInfo.url) {
    logYouTubeTab(tab);
  }

  // If the currently active tab navigates from non-YouTube -> YouTube,
  // count it as an "open" (this still follows the rule: non-YouTube -> YouTube).
  if (tab && tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    const prevIsYouTube = Boolean(isYouTubeByTabId.get(tabId));
    const { isYouTube, pageType } = classifyTab(tab);
    isYouTubeByTabId.set(tabId, isYouTube);

    if (!prevIsYouTube && isYouTube) {
      incrementYouTubeOpensToday({
        url: tab.url,
        pageType,
        reason: "active-tab navigated non-YouTube -> YouTube"
      });
    }
  }
});

// Listen for when the active tab changes in a window.
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    logYouTubeTab(tab);

    const prevWindowWasYouTube = Boolean(
      lastActiveIsYouTubeByWindowId.get(activeInfo.windowId)
    );
    const { isYouTube, pageType } = classifyTab(tab);

    // Update state for next activation.
    lastActiveIsYouTubeByWindowId.set(activeInfo.windowId, isYouTube);
    isYouTubeByTabId.set(activeInfo.tabId, isYouTube);

    // Only count when switching from a non-YouTube active tab to a YouTube active tab.
    if (!prevWindowWasYouTube && isYouTube) {
      incrementYouTubeOpensToday({
        url: tab.url,
        pageType,
        reason: "switched active tab non-YouTube -> YouTube"
      });
    }
  });
});

// --- Active YouTube time tracking ---
// NOTE: This uses setInterval (1s) as requested. MV3 service workers may sleep
// when idle, so time tracking depends on the service worker staying alive.

let isChromeFocused = false;
let focusedWindowId = null;

// Track whether we are currently counting time for an active YouTube tab.
let isCurrentlyCountingActiveYouTube = false;
let activeTimeTickCounter = 0; // just for reference in logs
let activeTimeTickInProgress = false;

// Initialize focus state and keep it updated.
if (chrome.windows && chrome.windows.getLastFocused) {
  chrome.windows.getLastFocused((win) => {
    const id = win && typeof win.id === "number" ? win.id : null;
    focusedWindowId = id;
    isChromeFocused = id !== null;
  });
}

chrome.windows.onFocusChanged.addListener((windowId) => {
  // windowId === -1 means "no focused window".
  focusedWindowId = windowId === -1 ? null : windowId;
  isChromeFocused = focusedWindowId !== null;

  console.log("[YouTube Tracker] Chrome focus changed.", {
    windowId,
    isChromeFocused
  });
});

function tabsQueryActiveInWindow(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, windowId }, (tabs) => resolve(tabs));
  });
}

async function incrementActiveYouTubeTimeMsBy1000({ url, pageType, shouldLog }) {
  const metrics = await ensureTodayDailyMetrics();
  const nextActiveYouTubeTimeMs = metrics.activeYouTubeTimeMs + 1000;
  let nextShortsFocusedTimeMs = metrics.shortsFocusedTimeMs;
  let nextWatchFocusedTimeMs = metrics.watchFocusedTimeMs;
  let nextBrowseFocusedTimeMs = metrics.browseFocusedTimeMs;

  // Increment exactly one page-type bucket per counted second.
  if (pageType === "shorts") {
    nextShortsFocusedTimeMs += 1000;
  } else if (pageType === "watch") {
    nextWatchFocusedTimeMs += 1000;
  } else {
    nextBrowseFocusedTimeMs += 1000;
  }

  await storageSet({
    [STORAGE_KEYS.date]: metrics.today,
    [STORAGE_KEYS.time]: nextActiveYouTubeTimeMs,
    [STORAGE_KEYS.shortsTime]: nextShortsFocusedTimeMs,
    [STORAGE_KEYS.watchTime]: nextWatchFocusedTimeMs,
    [STORAGE_KEYS.browseTime]: nextBrowseFocusedTimeMs
  });

  if (shouldLog) {
    const incrementedBucket =
      pageType === "shorts"
        ? STORAGE_KEYS.shortsTime
        : pageType === "watch"
          ? STORAGE_KEYS.watchTime
          : STORAGE_KEYS.browseTime;

    console.log("[YouTube Tracker] Added active YouTube time.", {
      today: metrics.today,
      addedMs: 1000,
      pageType,
      incrementedBucket,
      activeYouTubeTimeMs: nextActiveYouTubeTimeMs,
      shortsFocusedTimeMs: nextShortsFocusedTimeMs,
      watchFocusedTimeMs: nextWatchFocusedTimeMs,
      browseFocusedTimeMs: nextBrowseFocusedTimeMs,
      url,
      // Sanity check: total should match bucket sum.
      bucketSum:
        nextShortsFocusedTimeMs + nextWatchFocusedTimeMs + nextBrowseFocusedTimeMs
    });
  }
}

async function tickActiveYouTubeTime() {
  if (activeTimeTickInProgress) return;
  activeTimeTickInProgress = true;

  try {
    // Only count when the Chrome window is focused.
    if (!isChromeFocused || focusedWindowId === null) {
      isCurrentlyCountingActiveYouTube = false;
      return;
    }

    const tabs = await tabsQueryActiveInWindow(focusedWindowId);
    const tab = tabs && tabs.length ? tabs[0] : null;
    if (!tab || !tab.url) {
      isCurrentlyCountingActiveYouTube = false;
      return;
    }

    const pageType = getYouTubePageType(tab.url);
    if (!pageType) {
      isCurrentlyCountingActiveYouTube = false;
      return;
    }

    const justStarted = !isCurrentlyCountingActiveYouTube;
    isCurrentlyCountingActiveYouTube = true;

    activeTimeTickCounter += 1;
    const shouldLog = true; // log every second we add time (requested)

    await incrementActiveYouTubeTimeMsBy1000({
      url: tab.url,
      pageType,
      shouldLog
    });
  } finally {
    activeTimeTickInProgress = false;
  }
}

let activeTimeIntervalStarted = false;
function startActiveTimeInterval() {
  if (activeTimeIntervalStarted) return;
  activeTimeIntervalStarted = true;
  setInterval(() => {
    void tickActiveYouTubeTime();
  }, 1000);
}

startActiveTimeInterval();

