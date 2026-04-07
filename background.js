// background.js - YouTube Tracker (Manifest V3 service worker)
// Listens for tab updates/activation and logs basic info for YouTube URLs.

// Storage keys for the first real metric.
const STORAGE_KEYS = {
  count: "youtubeOpenCount",
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
  const today = getTodayDateString();
  const stored = await storageGet([STORAGE_KEYS.count, STORAGE_KEYS.date]);

  const storedDate = stored[STORAGE_KEYS.date];
  let count = Number(stored[STORAGE_KEYS.count] ?? 0);

  // If the stored date isn't today, reset for the new day.
  if (storedDate !== today) {
    console.log("[YouTube Tracker] New day detected. Resetting counter.", {
      storedDate,
      today
    });
    count = 0;
  }

  count += 1;

  await storageSet({
    [STORAGE_KEYS.date]: today,
    [STORAGE_KEYS.count]: count
  });

  console.log("[YouTube Tracker] Counted a YouTube open.", {
    today,
    count,
    reason: details.reason,
    url: details.url,
    pageType: details.pageType
  });
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

