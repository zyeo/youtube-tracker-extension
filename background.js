// background.js - YouTube Tracker (Manifest V3 service worker)
// Listens for tab updates/activation and logs basic info for YouTube URLs.

import {
  applyFocusedYouTubeSessionToDailyStats,
  createSessionHistoryRecord,
  getCountableElapsedTimeMs,
  getDailyGoalNotificationDates,
  getOpenCountTransitionUpdate,
  getTodayDateString,
  normalizeDailyGoalMinutes,
  normalizeRetentionDays,
  getYouTubePageType,
  pruneDailyStats,
  pruneSessionHistory
} from "./utils.js";

// Storage keys for daily history.
const STORAGE_KEYS = {
  dailyStats: "dailyStats",
  activeSession: "activeSession",
  sessionHistory: "sessionHistory",
  activeState: "activeState",
  retentionDays: "retentionDays",
  dailyGoalMinutes: "dailyGoalMinutes",
  dailyGoalNotifications: "dailyGoalNotifications"
};
const ACTIVE_SESSION_ALARM_NAME = "active-session-commit";
const ACTIVE_SESSION_ALARM_PERIOD_MINUTES = 1;
const IDLE_CUTOFF_MS = 30 * 1000;
const YOUTUBE_ROUTE_CHANGED_MESSAGE = "youtube-route-changed";
const YOUTUBE_ENGAGEMENT_CHANGED_MESSAGE = "youtube-engagement-changed";
const SYNC_ACTIVE_SESSION_MESSAGE = "sync-active-session";
const NOTIFICATION_ICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+tm0YAAAAASUVORK5CYII=";

/**
 * Promise wrappers for chrome.storage.local (keeps code readable).
 */
function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

function createDailyGoalExceededNotification(dateKey, goalMinutes) {
  if (!chrome.notifications || typeof chrome.notifications.create !== "function") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.notifications.create(
      `daily-goal-exceeded-${dateKey}`,
      {
        type: "basic",
        iconUrl: NOTIFICATION_ICON_URL,
        title: "Daily YouTube goal reached",
        message: `You have exceeded your ${goalMinutes}-minute YouTube goal for ${dateKey}.`
      },
      (notificationId) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[YouTube Tracker] Failed to create daily goal notification.",
            chrome.runtime.lastError.message
          );
          resolve(false);
          return;
        }
        resolve(Boolean(notificationId));
      }
    );
  });
}

async function getRetentionDays() {
  const stored = await storageGet([STORAGE_KEYS.retentionDays]);
  return normalizeRetentionDays(stored[STORAGE_KEYS.retentionDays]);
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

// --- State tracking to enforce counting rules ---
// Only count when moving from a non-YouTube active tab to a YouTube active tab.
// Do NOT count switching between two YouTube tabs.
const lastActiveIsYouTubeByWindowId = new Map(); // windowId -> boolean
const isYouTubeByTabId = new Map(); // tabId -> boolean (best-effort, updated on tab updates)
const engagementStateByTabId = new Map(); // tabId -> video playback state

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
    if (chrome.runtime.lastError || !tab) {
      return;
    }

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
    chrome.tabs.query({ active: true, windowId }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve([]);
        return;
      }

      resolve(tabs);
    });
  });
}

function windowsGetLastFocused() {
  return new Promise((resolve) => {
    chrome.windows.getLastFocused((win) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(win);
    });
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

  if (options.useTabHintAsFocused && tabHint && tabHint.url) {
    focusedWindowId = tabHint.windowId;
    isChromeFocused = true;
    return tabHint;
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
  const stored = await storageGet([
    STORAGE_KEYS.activeState,
    STORAGE_KEYS.dailyStats
  ]);
  const activeState = cloneActiveState(stored[STORAGE_KEYS.activeState]);
  const today = getTodayDateString();
  const transition = getOpenCountTransitionUpdate({
    activeState,
    dailyStats: stored[STORAGE_KEYS.dailyStats] || {},
    today,
    tab,
    isYouTube
  });

  lastActiveIsYouTubeByWindowId.set(windowId, isYouTube);
  if (typeof tab.id === "number") {
    isYouTubeByTabId.set(tab.id, isYouTube);
  }

  if (transition.counted) {
    const retentionDays = await getRetentionDays();

    await storageSet({
      [STORAGE_KEYS.dailyStats]: pruneDailyStats(
        transition.dailyStats,
        new Date(),
        retentionDays
      ),
      [STORAGE_KEYS.activeState]: transition.activeState
    });

    console.log("[YouTube Tracker] Counted a YouTube open.", {
      today,
      count: transition.count,
      reason: details.reason,
      url: tab.url,
      pageType: details.pageType || pageType
    });
    return;
  }

  await storageSet({ [STORAGE_KEYS.activeState]: transition.activeState });
}

function enqueueOpenCountUpdate(tab, windowId, details) {
  enqueueStorageOperation(() => updateOpenCountForActiveTab(tab, windowId, details));
}

function createTabHintFromRouteMessage(senderTab, url) {
  if (
    !senderTab ||
    typeof senderTab.id !== "number" ||
    typeof senderTab.windowId !== "number" ||
    !url
  ) {
    return null;
  }

  const pageType = getYouTubePageType(url);
  if (!pageType) {
    return null;
  }

  return {
    ...senderTab,
    url
  };
}

function createTabHintFromPopupMessage(tabHint) {
  if (
    !tabHint ||
    typeof tabHint.id !== "number" ||
    typeof tabHint.windowId !== "number" ||
    !tabHint.url
  ) {
    return null;
  }

  const pageType = getYouTubePageType(tabHint.url);
  if (!pageType) {
    return null;
  }

  return {
    id: tabHint.id,
    windowId: tabHint.windowId,
    url: tabHint.url,
    active: tabHint.active !== false
  };
}

function getEngagementState(tabId) {
  return typeof tabId === "number" ? engagementStateByTabId.get(tabId) : null;
}

function createEngagementUpdateFromMessage(senderTab, message) {
  if (!senderTab || typeof senderTab.id !== "number") {
    return null;
  }

  const pageType = getYouTubePageType(message && message.url);
  if (!pageType) {
    return {
      tabId: senderTab.id,
      tabHint: null,
      engagementState: null
    };
  }

  return {
    tabId: senderTab.id,
    tabHint: {
      ...senderTab,
      url: message.url
    },
    engagementState: {
      url: message.url,
      isVideoPlaying: Boolean(message.isVideoPlaying),
      hasVideo: Boolean(message.hasVideo),
      updatedAt: Date.now()
    }
  };
}

function createActiveSession(tab, pageType, now) {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    pageType,
    startedAt: now,
    lastCommittedAt: now,
    activeElapsedMs: 0
  };
}

function createLiveStatus(activeTab, nextSession) {
  const { pageType } = classifyTab(activeTab);
  const engagementState = activeTab ? getEngagementState(activeTab.id) : null;
  const now = Date.now();
  const committedActiveElapsedMs = Math.max(
    0,
    Number(nextSession && nextSession.activeElapsedMs) || 0
  );
  const lastCommittedAt = Number(
    nextSession && (nextSession.lastCommittedAt ?? nextSession.startedAt)
  );
  const liveElapsedMs = nextSession && Number.isFinite(lastCommittedAt)
    ? getCountableElapsedTimeMs({
        pageType,
        startedAt: lastCommittedAt,
        endedAt: now,
        sessionStartedAt: nextSession.startedAt,
        isVideoPlaying: engagementState && engagementState.isVideoPlaying,
        idleCutoffMs: IDLE_CUTOFF_MS
      })
    : 0;
  const activeElapsedMs = committedActiveElapsedMs + liveElapsedMs;
  const isEngaged = nextSession && Number.isFinite(lastCommittedAt)
    ? getCountableElapsedTimeMs({
        pageType,
        startedAt: now - 1,
        endedAt: now,
        sessionStartedAt: nextSession.startedAt,
        isVideoPlaying: engagementState && engagementState.isVideoPlaying,
        idleCutoffMs: IDLE_CUTOFF_MS
      }) > 0
    : false;

  return {
    isTracking: Boolean(nextSession),
    pageType,
    activeElapsedMs,
    isEngaged
  };
}

function shouldContinueSession(activeSession, nextSession, ignoredStaleGapMs) {
  return Boolean(
    activeSession &&
      nextSession &&
      !ignoredStaleGapMs &&
      activeSession.tabId === nextSession.tabId &&
      activeSession.windowId === nextSession.windowId &&
      activeSession.pageType === nextSession.pageType
  );
}

async function commitStoredActiveSession(now) {
  const stored = await storageGet([
    STORAGE_KEYS.dailyStats,
    STORAGE_KEYS.activeSession,
    STORAGE_KEYS.sessionHistory,
    STORAGE_KEYS.activeState,
    STORAGE_KEYS.retentionDays,
    STORAGE_KEYS.dailyGoalMinutes,
    STORAGE_KEYS.dailyGoalNotifications
  ]);
  const activeSession = stored[STORAGE_KEYS.activeSession];
  const retentionDays = normalizeRetentionDays(stored[STORAGE_KEYS.retentionDays]);
  const dailyGoalMinutes = normalizeDailyGoalMinutes(
    stored[STORAGE_KEYS.dailyGoalMinutes]
  );
  const dailyStats = pruneDailyStats(
    stored[STORAGE_KEYS.dailyStats] || {},
    new Date(now),
    retentionDays
  );
  const activeState = cloneActiveState(stored[STORAGE_KEYS.activeState]);
  const sessionHistory = pruneSessionHistory(
    stored[STORAGE_KEYS.sessionHistory] || [],
    new Date(now),
    retentionDays
  );
  const dailyGoalNotifications = pruneDailyStats(
    stored[STORAGE_KEYS.dailyGoalNotifications] || {},
    new Date(now),
    retentionDays
  );

  if (!activeSession) {
    return {
      dailyStats,
      activeState,
      sessionHistory,
      activeSession: null,
      committedElapsedMs: 0,
      committedThroughAt: null,
      ignoredStaleGapMs: 0,
      dailyGoalNotifications,
      dailyGoalNotificationDates: []
    };
  }

  const lastCommittedAt = Number(
    activeSession.lastCommittedAt ?? activeSession.startedAt
  );

  if (!Number.isFinite(lastCommittedAt) || now <= lastCommittedAt) {
    return {
      dailyStats,
      activeState,
      sessionHistory,
      activeSession,
      committedElapsedMs: 0,
      activeElapsedMs: Math.max(
        0,
        Number(activeSession && activeSession.activeElapsedMs) || 0
      ),
      committedThroughAt: lastCommittedAt,
      ignoredStaleGapMs: 0,
      dailyGoalNotifications,
      dailyGoalNotificationDates: []
    };
  }

  const engagementState = getEngagementState(activeSession.tabId);
  const countableElapsedMs = getCountableElapsedTimeMs({
    pageType: activeSession.pageType,
    startedAt: lastCommittedAt,
    endedAt: now,
    sessionStartedAt: activeSession.startedAt,
    isVideoPlaying: engagementState && engagementState.isVideoPlaying,
    idleCutoffMs: IDLE_CUTOFF_MS
  });
  const committedThroughAt = lastCommittedAt + countableElapsedMs;
  const activeElapsedMs =
    Math.max(0, Number(activeSession.activeElapsedMs) || 0) +
    countableElapsedMs;

  const nextDailyStats = countableElapsedMs > 0
    ? applyFocusedYouTubeSessionToDailyStats(
        dailyStats,
        {
          ...activeSession,
          startedAt: lastCommittedAt,
          endedAt: committedThroughAt
        }
      )
    : dailyStats;
  const dailyGoalNotificationDates = getDailyGoalNotificationDates(
    dailyStats,
    nextDailyStats,
    dailyGoalMinutes,
    dailyGoalNotifications
  );

  for (const dateKey of dailyGoalNotificationDates) {
    dailyGoalNotifications[dateKey] = "pending";
  }

  return {
    dailyStats: nextDailyStats,
    activeState,
    sessionHistory,
    activeSession,
    committedElapsedMs: countableElapsedMs,
    activeElapsedMs,
    committedThroughAt,
    ignoredStaleGapMs: 0,
    dailyGoalNotifications,
    dailyGoalNotificationDates,
    dailyGoalMinutes
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
    sessionHistory,
    activeSession,
    committedElapsedMs,
    activeElapsedMs,
    committedThroughAt,
    ignoredStaleGapMs,
    dailyGoalNotifications,
    dailyGoalNotificationDates,
    dailyGoalMinutes
  } = await commitStoredActiveSession(now);
  const shouldUpdateActiveState = !options.skipActiveStateUpdate;
  const continueSession = shouldContinueSession(
    activeSession,
    nextSession,
    ignoredStaleGapMs
  );
  const nextActiveState = shouldUpdateActiveState && activeTab
    ? updateActiveStateForTab(activeState, activeTab, Boolean(pageType))
    : activeState;
  let nextSessionHistory = sessionHistory;

  if (activeSession && !continueSession) {
    const completedSessionEndedAt = ignoredStaleGapMs
      ? Number(activeSession.lastCommittedAt ?? activeSession.startedAt)
      : Number(committedThroughAt ?? now);
    const completedSessionRecord = createSessionHistoryRecord(
      activeSession,
      completedSessionEndedAt
    );

    if (completedSessionRecord) {
      nextSessionHistory = [...sessionHistory, completedSessionRecord];
    }
  }

  if (!activeSession && !nextSession) {
    const itemsToSet = {
      [STORAGE_KEYS.dailyStats]: dailyStats,
      [STORAGE_KEYS.sessionHistory]: nextSessionHistory,
      [STORAGE_KEYS.dailyGoalNotifications]: dailyGoalNotifications
    };

    if (shouldUpdateActiveState && activeTab) {
      itemsToSet[STORAGE_KEYS.activeState] = nextActiveState;
    }

    await storageSet(itemsToSet);
    return createLiveStatus(activeTab, null);
  }

  if (continueSession) {
    nextSession.startedAt = activeSession.startedAt;
    nextSession.activeElapsedMs = activeElapsedMs;
  }

  const itemsToSet = {
    [STORAGE_KEYS.dailyStats]: dailyStats,
    [STORAGE_KEYS.activeSession]: nextSession,
    [STORAGE_KEYS.sessionHistory]: nextSessionHistory,
    [STORAGE_KEYS.dailyGoalNotifications]: dailyGoalNotifications
  };

  if (shouldUpdateActiveState) {
    itemsToSet[STORAGE_KEYS.activeState] = nextActiveState;
  }

  await storageSet(itemsToSet);

  for (const dateKey of dailyGoalNotificationDates) {
    const didNotify = await createDailyGoalExceededNotification(
      dateKey,
      dailyGoalMinutes
    );

    if (didNotify) {
      dailyGoalNotifications[dateKey] = true;
      await storageSet({
        [STORAGE_KEYS.dailyGoalNotifications]: dailyGoalNotifications
      });
    }
  }

  console.log("[YouTube Tracker] Synced active YouTube session.", {
    reason,
    committedElapsedMs,
    ignoredStaleGapMs,
    previousSession: activeSession,
    nextSession
  });

  return createLiveStatus(activeTab, nextSession);
}

function enqueueActiveSessionSync(reason, tabHint, options) {
  return enqueueStorageOperation(() => syncActiveSession(reason, tabHint, options));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === SYNC_ACTIVE_SESSION_MESSAGE) {
    const tabHint = createTabHintFromPopupMessage(message.tab);
    enqueueActiveSessionSync("popup requested active session sync", tabHint, {
      useTabHintAsFocused: Boolean(tabHint)
    }).then((liveStatus) => {
      sendResponse({ ok: true, usedTabHint: Boolean(tabHint), liveStatus });
    });
    return true;
  }

  if (message && message.type === YOUTUBE_ENGAGEMENT_CHANGED_MESSAGE) {
    const engagementUpdate = createEngagementUpdateFromMessage(
      sender && sender.tab,
      message
    );
    if (engagementUpdate) {
      enqueueStorageOperation(async () => {
        if (engagementUpdate.tabHint) {
          await syncActiveSession(
            "before YouTube engagement changed",
            engagementUpdate.tabHint
          );
        }

        if (engagementUpdate.engagementState) {
          engagementStateByTabId.set(
            engagementUpdate.tabId,
            engagementUpdate.engagementState
          );
        } else {
          engagementStateByTabId.delete(engagementUpdate.tabId);
        }

        if (engagementUpdate.tabHint) {
          await syncActiveSession(
            "YouTube engagement changed",
            engagementUpdate.tabHint
          );
        }
      });
    }
    return;
  }

  if (!message || message.type !== YOUTUBE_ROUTE_CHANGED_MESSAGE) {
    return;
  }

  const tabHint = createTabHintFromRouteMessage(sender && sender.tab, message.url);
  if (!tabHint) {
    return;
  }

  isYouTubeByTabId.set(tabHint.id, true);
  enqueueActiveSessionSync("YouTube SPA route changed", tabHint);
});

function startActiveSessionAlarm() {
  if (!chrome.alarms) return;

  chrome.alarms.create(ACTIVE_SESSION_ALARM_NAME, {
    periodInMinutes: ACTIVE_SESSION_ALARM_PERIOD_MINUTES
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  isYouTubeByTabId.delete(tabId);
  engagementStateByTabId.delete(tabId);
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
