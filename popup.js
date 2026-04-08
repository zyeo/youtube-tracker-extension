// popup.js - YouTube Tracker
// Shows today's metrics from chrome.storage.local dailyStats history.

document.addEventListener("DOMContentLoaded", () => {
  console.log("[YouTube Tracker] Popup loaded.");

  const openCountEl = document.getElementById("openCount");
  const focusedTimeEl = document.getElementById("focusedTime");
  const shortsTimeEl = document.getElementById("shortsTime");
  const watchTimeEl = document.getElementById("watchTime");
  const browseTimeEl = document.getElementById("browseTime");
  const opensComparisonEl = document.getElementById("opensComparison");
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

  function getYesterdayDateString() {
    const now = new Date();
    now.setDate(now.getDate() - 1);
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function getOpensComparison(todayCount, yesterdayCount) {
    const today = Number(todayCount ?? 0);
    const yesterday = Number(yesterdayCount ?? 0);

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

  function updateMetricsDisplay(dailyStatsObj) {
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();
    const todayStats = (dailyStatsObj && dailyStatsObj[today]) || {};
    const yesterdayStats = (dailyStatsObj && dailyStatsObj[yesterday]) || {};

    const youtubeOpenCount = Number(todayStats.youtubeOpenCount ?? 0);
    const yesterdayOpenCount = Number(yesterdayStats.youtubeOpenCount ?? 0);
    // Main popup metric is total YouTube focused time today.
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

    if (opensComparisonEl) {
      const comparison = getOpensComparison(youtubeOpenCount, yesterdayOpenCount);
      opensComparisonEl.textContent = comparison.text;
      opensComparisonEl.classList.remove("is-up", "is-down", "is-neutral");
      opensComparisonEl.classList.add(`is-${comparison.tone}`);
    }
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

