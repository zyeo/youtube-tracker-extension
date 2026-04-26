// popup.js - YouTube Tracker
// Shows today's metrics from chrome.storage.local dailyStats history.

import {
  formatMsAsClock,
  getDailyGoalProgress,
  getTodayDateString,
  getYesterdayDateString
} from "./utils.js";

document.addEventListener("DOMContentLoaded", () => {
  console.log("[YouTube Tracker] Popup loaded.");

  const openCountEl = document.getElementById("openCount");
  const focusedTimeEl = document.getElementById("focusedTime");
  const shortsTimeEl = document.getElementById("shortsTime");
  const watchTimeEl = document.getElementById("watchTime");
  const browseTimeEl = document.getElementById("browseTime");
  const timeComparisonEl = document.getElementById("timeComparison");
  const opensComparisonEl = document.getElementById("opensComparison");
  const goalProgressTextEl = document.getElementById("goalProgressText");
  const goalProgressBarEl = document.getElementById("goalProgressBar");
  const openDashboardBtn = document.getElementById("openDashboard");
  const openOptionsBtn = document.getElementById("openOptions");

  const STORAGE_KEYS = {
    dailyGoalMinutes: "dailyGoalMinutes",
    dailyStats: "dailyStats"
  };
  const SYNC_ACTIVE_SESSION_MESSAGE = "sync-active-session";
  let syncInProgress = false;

  function getVsYesterdayComparison(todayValue, yesterdayValue) {
    const today = Number(todayValue ?? 0);
    const yesterday = Number(yesterdayValue ?? 0);

    if (today === yesterday) {
      return { text: "No change vs yesterday", tone: "neutral" };
    }

    if (yesterday === 0 && today > 0) {
      return { text: "↑ from 0 yesterday", tone: "up" };
    }

    if (today > yesterday) {
      const increasePct = Math.round(((today - yesterday) / yesterday) * 100);
      return { text: `↑ ${increasePct}% vs yesterday`, tone: "up" };
    }

    const decreasePct = Math.round(((yesterday - today) / yesterday) * 100);
    return { text: `↓ ${decreasePct}% vs yesterday`, tone: "down" };
  }

  function updateGoalDisplay(focusedYouTubeTimeMs, storedGoalMinutes) {
    if (!goalProgressTextEl || !goalProgressBarEl) {
      return;
    }

    const { dailyGoalMinutes, progressPct, clampedProgressPct } =
      getDailyGoalProgress(focusedYouTubeTimeMs, storedGoalMinutes);

    goalProgressTextEl.textContent = `Goal: ${progressPct}% of ${dailyGoalMinutes} min`;
    goalProgressBarEl.style.width = `${clampedProgressPct}%`;
  }

  function updateMetricsDisplay(dailyStatsObj, storedGoalMinutes) {
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();
    const todayStats = (dailyStatsObj && dailyStatsObj[today]) || {};
    const yesterdayStats = (dailyStatsObj && dailyStatsObj[yesterday]) || {};

    const youtubeOpenCount = Number(todayStats.youtubeOpenCount ?? 0);
    const yesterdayOpenCount = Number(yesterdayStats.youtubeOpenCount ?? 0);
    // Main popup metric is total YouTube focused time today.
    const focusedYouTubeTimeMs = Number(todayStats.activeYouTubeTimeMs ?? 0);
    const yesterdayFocusedYouTubeTimeMs = Number(
      yesterdayStats.activeYouTubeTimeMs ?? 0
    );
    const shortsFocusedTimeMs = Number(todayStats.shortsFocusedTimeMs ?? 0);
    const watchFocusedTimeMs = Number(todayStats.watchFocusedTimeMs ?? 0);
    const browseFocusedTimeMs = Number(todayStats.browseFocusedTimeMs ?? 0);

    openCountEl.textContent = String(
      Number.isFinite(youtubeOpenCount) ? youtubeOpenCount : 0
    );
    focusedTimeEl.textContent = formatMsAsClock(focusedYouTubeTimeMs);
    shortsTimeEl.textContent = formatMsAsClock(shortsFocusedTimeMs);
    watchTimeEl.textContent = formatMsAsClock(watchFocusedTimeMs);
    browseTimeEl.textContent = formatMsAsClock(browseFocusedTimeMs);
    updateGoalDisplay(focusedYouTubeTimeMs, storedGoalMinutes);

    if (timeComparisonEl) {
      const comparison = getVsYesterdayComparison(
        focusedYouTubeTimeMs,
        yesterdayFocusedYouTubeTimeMs
      );
      timeComparisonEl.textContent = comparison.text;
      timeComparisonEl.classList.remove("is-up", "is-down", "is-neutral");
      timeComparisonEl.classList.add(`is-${comparison.tone}`);
    }

    if (opensComparisonEl) {
      const comparison = getVsYesterdayComparison(
        youtubeOpenCount,
        yesterdayOpenCount
      );
      opensComparisonEl.textContent = comparison.text;
      opensComparisonEl.classList.remove("is-up", "is-down", "is-neutral");
      opensComparisonEl.classList.add(`is-${comparison.tone}`);
    }
  }

  function readAndRender() {
    chrome.storage.local.get(
      [STORAGE_KEYS.dailyGoalMinutes, STORAGE_KEYS.dailyStats],
      (data) => {
        updateMetricsDisplay(
          data[STORAGE_KEYS.dailyStats],
          data[STORAGE_KEYS.dailyGoalMinutes]
        );
      }
    );
  }

  function syncActiveSessionThenRender() {
    if (syncInProgress) return;
    syncInProgress = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const ignoredQueryError = chrome.runtime.lastError;
      void ignoredQueryError;

      const activeTab = tabs && tabs.length ? tabs[0] : null;
      chrome.runtime.sendMessage(
        {
          type: SYNC_ACTIVE_SESSION_MESSAGE,
          tab: activeTab
            ? {
                id: activeTab.id,
                windowId: activeTab.windowId,
                url: activeTab.url,
                active: activeTab.active
              }
            : null
        },
        () => {
          const ignoredMessageError = chrome.runtime.lastError;
          void ignoredMessageError;
          syncInProgress = false;
          readAndRender();
        }
      );
    });
  }

  // Initial render.
  syncActiveSessionThenRender();
  window.setInterval(syncActiveSessionThenRender, 1000);

  // Live update while the popup is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const changedKeys = Object.keys(changes || {});
    if (
      changedKeys.includes(STORAGE_KEYS.dailyStats) ||
      changedKeys.includes(STORAGE_KEYS.dailyGoalMinutes)
    ) {
      readAndRender();
    }
  });

  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("dashboard.html");
      chrome.tabs.create({ url });
    });
  }

  if (openOptionsBtn) {
    openOptionsBtn.addEventListener("click", () => {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }

      const url = chrome.runtime.getURL("options.html");
      chrome.tabs.create({ url });
    });
  }
});
