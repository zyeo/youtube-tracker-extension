// background.js - YouTube Tracker (Manifest V3 service worker)
// Listens for tab updates/activation and logs basic info for YouTube URLs.

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

// Listen for tab updates (URL changes, page loads, etc.).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act when the URL has changed or the page is fully loaded.
  if (changeInfo.status === "complete" || changeInfo.url) {
    logYouTubeTab(tab);
  }
});

// Listen for when the active tab changes in a window.
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    logYouTubeTab(tab);
  });
});

