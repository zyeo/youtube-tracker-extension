// popup.js - YouTube Tracker
// Shows the "YouTube opens today" count from chrome.storage.local.

document.addEventListener("DOMContentLoaded", () => {
  console.log("[YouTube Tracker] Popup loaded.");

  const openCountEl = document.getElementById("openCount");
  const focusedTimeEl = document.getElementById("focusedTime");
  const shortsTimeEl = document.getElementById("shortsTime");
  const watchTimeEl = document.getElementById("watchTime");
  const browseTimeEl = document.getElementById("browseTime");
  const openDashboardBtn = document.getElementById("openDashboard");

  const STORAGE_KEYS = {
    dailyStats: "dailyStats"
  };

  function getTodayDateString() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatMsAsClock(ms) {
    const totalSeconds = Math.floor(Number(ms ?? 0) / 1000);
    const seconds = totalSeconds % 60;
    const minutesTotal = Math.floor(totalSeconds / 60);

    if (minutesTotal < 60) {
      // Under 1 hour: MM:SS
      const mm = String(minutesTotal).padStart(2, "0");
      const ss = String(seconds).padStart(2, "0");
      return `${mm}:${ss}`;
    }

    // 1 hour or more: HH:MM:SS
    const hh = String(Math.floor(minutesTotal / 60)).padStart(2, "0");
    const mm = String(minutesTotal % 60).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function updateMetricsDisplay(dailyStatsObj) {
    const today = getTodayDateString();
    const todayStats = (dailyStatsObj && dailyStatsObj[today]) || {};

    const youtubeOpenCount = Number(todayStats.youtubeOpenCount ?? 0);
    const focusedYouTubeTimeMs = Number(todayStats.activeYouTubeTimeMs ?? 0);
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
  }

  function readAndRender() {
    chrome.storage.local.get(
      [STORAGE_KEYS.dailyStats],
      (data) => {
        updateMetricsDisplay(data[STORAGE_KEYS.dailyStats]);
      }
    );
  }

  // Initial render.
  readAndRender();

  // Live update while the popup is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const changedKeys = Object.keys(changes || {});
    if (changedKeys.includes(STORAGE_KEYS.dailyStats)) {
      readAndRender();
    }
  });

  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", () => {
      const url = chrome.runtime.getURL("dashboard.html");
      chrome.tabs.create({ url });
    });
  }
});

