// background.js - YouTube Tracker (Manifest V3 service worker)
// Listens for tab updates/activation and logs basic info for YouTube URLs.

import {
  applyFocusedYouTubeSessionToDailyStats,
  getTodayDateString,
  getYouTubePageType
} from "./utils.js";

// Storage keys for daily history.
const STORAGE_KEYS = {
  dailyStats: "dailyStats",
  activeSession: "activeSession",
  activeState: "activeState"
};
const ACTIVE_SESSION_ALARM_NAME = "active-session-commit";
const ACTIVE_SESSION_ALARM_PERIOD_MINUTES = 1;
const STALE_SESSION_GAP_MS = 5 * 60 * 1000;

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
 * Get today's stats entry from the daily history, creating it if needed.
 * Shape in storage:
 * {
 *   dailyStats: {
 *     "YYYY-MM-DD": {
 *       youtubeOpenCount,
 *       activeYouTubeTimeMs,
 *       shortsFocusedTimeMs,
 *       watchFocusedTimeMs,
 *       browseFocusedTimeMs
 *     }
 *   }
 * }
 */
async function getOrInitTodayStats() {
  const today = getTodayDateString();
  const stored = await storageGet([STORAGE_KEYS.dailyStats]);
  const dailyStats = stored[STORAGE_KEYS.dailyStats] || {};

  const emptyStats = {
    youtubeOpenCount: 0,
    activeYouTubeTimeMs: 0,
    shortsFocusedTimeMs: 0,
    watchFocusedTimeMs: 0,
    browseFocusedTimeMs: 0
  };

  const todayStats = {
    ...emptyStats,
    ...(dailyStats[today] || {})
  };

  dailyStats[today] = todayStats;

  return { today, dailyStats, todayStats };
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
    const { isYouTube, pageType } = classifyTab(tab);
    isYouTubeByTabId.set(tabId, isYouTube);

    enqueueOpenCountUpdate(tab, tab.windowId, {
      pageType,
      reason: "active-tab navigated non-YouTube -> YouTube"
    });
    enqueueActiveSessionSync("active tab updated", tab);
  }
});

// Listen for when the active tab changes in a window.
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    logYouTubeTab(tab);

    const { isYouTube, pageType } = classifyTab(tab);

    // Update state for next activation.
    lastActiveIsYouTubeByWindowId.set(activeInfo.windowId, isYouTube);
    isYouTubeByTabId.set(activeInfo.tabId, isYouTube);

    enqueueOpenCountUpdate(tab, activeInfo.windowId, {
      pageType,
      reason: "switched active tab non-YouTube -> YouTube"
    });
    enqueueActiveSessionSync("active tab changed", tab);
  });
});

// --- Active YouTube time tracking ---
let isChromeFocused = false;
let focusedWindowId = null;
let storageOperationQueue = Promise.resolve();

// Initialize focus state and keep it updated.
if (chrome.windows && chrome.windows.getLastFocused) {
  chrome.windows.getLastFocused((win) => {
    setFocusedWindowState(win);
    enqueueActiveSessionSync("background initialized", null, {
      skipActiveStateUpdate: true
    });
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

  enqueueActiveSessionSync("window focus changed", null, {
    forceNoFocusedWindow: windowId === -1
  });
});

function tabsQueryActiveInWindow(windowId) {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, windowId }, (tabs) => resolve(tabs));
  });
}

function windowsGetLastFocused() {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused((win) => resolve(win));
  });
}

function setFocusedWindowState(win) {
  const isFocused = Boolean(win && win.focused && typeof win.id === "number");
  focusedWindowId = isFocused ? win.id : null;
  isChromeFocused = isFocused;
}

function enqueueStorageOperation(operation) {
  storageOperationQueue = storageOperationQueue.then(operation).catch((error) => {
    console.error("[YouTube Tracker] Storage operation failed.", error);
  });
  return storageOperationQueue;
}

async function getFocusedActiveTab(tabHint, options = {}) {
  if (options.forceNoFocusedWindow) {
    focusedWindowId = null;
    isChromeFocused = false;
    return null;
  }

  const win = await windowsGetLastFocused();
  setFocusedWindowState(win);

  if (!isChromeFocused || focusedWindowId === null) {
    return null;
  }

  if (
    tabHint &&
    tabHint.active &&
    tabHint.windowId === focusedWindowId &&
    tabHint.url
  ) {
    return tabHint;
  }

  const tabs = await tabsQueryActiveInWindow(focusedWindowId);
  return tabs && tabs.length ? tabs[0] : null;
}

function hydrateOpenCountState(tab) {
  if (!tab || typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    return;
  }

  const { isYouTube } = classifyTab(tab);
  lastActiveIsYouTubeByWindowId.set(tab.windowId, isYouTube);
  isYouTubeByTabId.set(tab.id, isYouTube);
}

function cloneActiveState(activeState) {
  return {
    windows: { ...((activeState && activeState.windows) || {}) },
    tabs: { ...((activeState && activeState.tabs) || {}) }
  };
}

function updateActiveStateForTab(activeState, tab, isYouTube) {
  const nextActiveState = cloneActiveState(activeState);

  if (tab && typeof tab.windowId === "number") {
    nextActiveState.windows[String(tab.windowId)] = Boolean(isYouTube);
  }

  if (tab && typeof tab.id === "number") {
    nextActiveState.tabs[String(tab.id)] = Boolean(isYouTube);
  }

  return nextActiveState;
}

async function updateOpenCountForActiveTab(tab, windowId, details) {
  if (!tab || typeof windowId !== "number") return;

  const { isYouTube, pageType } = classifyTab(tab);
  const stored = await storageGet([STORAGE_KEYS.activeState]);
  const activeState = cloneActiveState(stored[STORAGE_KEYS.activeState]);
  const windowKey = String(windowId);
  const hadPreviousWindowState = Object.prototype.hasOwnProperty.call(
    activeState.windows,
    windowKey
  );
  const previousWindowWasYouTube = Boolean(activeState.windows[windowKey]);
  const nextActiveState = updateActiveStateForTab(activeState, tab, isYouTube);

  lastActiveIsYouTubeByWindowId.set(windowId, isYouTube);
  if (typeof tab.id === "number") {
    isYouTubeByTabId.set(tab.id, isYouTube);
  }

  if (hadPreviousWindowState && !previousWindowWasYouTube && isYouTube) {
    const { today, dailyStats, todayStats } = await getOrInitTodayStats();
    const nextCount = todayStats.youtubeOpenCount + 1;
    todayStats.youtubeOpenCount = nextCount;
    dailyStats[today] = todayStats;

    await storageSet({
      [STORAGE_KEYS.dailyStats]: dailyStats,
      [STORAGE_KEYS.activeState]: nextActiveState
    });

    console.log("[YouTube Tracker] Counted a YouTube open.", {
      today,
      count: nextCount,
      reason: details.reason,
      url: tab.url,
      pageType: details.pageType || pageType
    });
    return;
  }

  await storageSet({ [STORAGE_KEYS.activeState]: nextActiveState });
}

function enqueueOpenCountUpdate(tab, windowId, details) {
  enqueueStorageOperation(() => updateOpenCountForActiveTab(tab, windowId, details));
}

function createActiveSession(tab, pageType, now) {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    pageType,
    startedAt: now,
    lastCommittedAt: now
  };
}

function shouldContinueSession(activeSession, nextSession, ignoredStaleGapMs) {
  return Boolean(
    activeSession &&
      nextSession &&
      !ignoredStaleGapMs &&
      activeSession.tabId === nextSession.tabId &&
      activeSession.windowId === nextSession.windowId &&
      activeSession.url === nextSession.url &&
      activeSession.pageType === nextSession.pageType
  );
}

async function commitStoredActiveSession(now) {
  const stored = await storageGet([
    STORAGE_KEYS.dailyStats,
    STORAGE_KEYS.activeSession,
    STORAGE_KEYS.activeState
  ]);
  const activeSession = stored[STORAGE_KEYS.activeSession];
  const dailyStats = stored[STORAGE_KEYS.dailyStats] || {};
  const activeState = cloneActiveState(stored[STORAGE_KEYS.activeState]);

  if (!activeSession) {
    return {
      dailyStats,
      activeState,
      activeSession: null,
      committedElapsedMs: 0,
      ignoredStaleGapMs: 0
    };
  }

  const lastCommittedAt = Number(
    activeSession.lastCommittedAt ?? activeSession.startedAt
  );

  if (!Number.isFinite(lastCommittedAt) || now <= lastCommittedAt) {
    return {
      dailyStats,
      activeState,
      activeSession,
      committedElapsedMs: 0,
      ignoredStaleGapMs: 0
    };
  }

  const elapsedMs = now - lastCommittedAt;

  if (elapsedMs > STALE_SESSION_GAP_MS) {
    return {
      dailyStats,
      activeState,
      activeSession,
      committedElapsedMs: 0,
      ignoredStaleGapMs: elapsedMs
    };
  }

  const nextDailyStats = applyFocusedYouTubeSessionToDailyStats(
    dailyStats,
    {
      ...activeSession,
      startedAt: lastCommittedAt,
      endedAt: now
    }
  );

  return {
    dailyStats: nextDailyStats,
    activeState,
    activeSession,
    committedElapsedMs: elapsedMs,
    ignoredStaleGapMs: 0
  };
}

async function syncActiveSession(reason, tabHint, options = {}) {
  const now = Date.now();
  const activeTab = await getFocusedActiveTab(tabHint, options);
  hydrateOpenCountState(activeTab);

  const { pageType } = classifyTab(activeTab);
  const nextSession =
    activeTab && pageType ? createActiveSession(activeTab, pageType, now) : null;
  const {
    dailyStats,
    activeState,
    activeSession,
    committedElapsedMs,
    ignoredStaleGapMs
  } = await commitStoredActiveSession(now);
  const shouldUpdateActiveState = !options.skipActiveStateUpdate;
  const nextActiveState = shouldUpdateActiveState && activeTab
    ? updateActiveStateForTab(activeState, activeTab, Boolean(pageType))
    : activeState;

  if (!activeSession && !nextSession) {
    if (shouldUpdateActiveState && activeTab) {
      await storageSet({ [STORAGE_KEYS.activeState]: nextActiveState });
    }
    return;
  }

  if (shouldContinueSession(activeSession, nextSession, ignoredStaleGapMs)) {
    nextSession.startedAt = activeSession.startedAt;
  }

  const itemsToSet = {
    [STORAGE_KEYS.dailyStats]: dailyStats,
    [STORAGE_KEYS.activeSession]: nextSession
  };

  if (shouldUpdateActiveState) {
    itemsToSet[STORAGE_KEYS.activeState] = nextActiveState;
  }

  await storageSet(itemsToSet);

  console.log("[YouTube Tracker] Synced active YouTube session.", {
    reason,
    committedElapsedMs,
    ignoredStaleGapMs,
    previousSession: activeSession,
    nextSession
  });
}

function enqueueActiveSessionSync(reason, tabHint, options) {
  enqueueStorageOperation(() => syncActiveSession(reason, tabHint, options));
}

function startActiveSessionAlarm() {
  if (!chrome.alarms) return;

  chrome.alarms.create(ACTIVE_SESSION_ALARM_NAME, {
    periodInMinutes: ACTIVE_SESSION_ALARM_PERIOD_MINUTES
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  isYouTubeByTabId.delete(tabId);
  enqueueActiveSessionSync("tab removed");
});

chrome.windows.onRemoved.addListener((windowId) => {
  lastActiveIsYouTubeByWindowId.delete(windowId);
  enqueueActiveSessionSync("window removed");
});

if (chrome.alarms) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm && alarm.name === ACTIVE_SESSION_ALARM_NAME) {
      enqueueActiveSessionSync("active session alarm");
    }
  });
}

startActiveSessionAlarm();
