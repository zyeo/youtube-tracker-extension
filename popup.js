// popup.js - YouTube Tracker
// Shows the "YouTube opens today" count from chrome.storage.local.

document.addEventListener("DOMContentLoaded", () => {
  console.log("[YouTube Tracker] Popup loaded.");

  const openCountEl = document.getElementById("openCount");
  const activeTimeEl = document.getElementById("activeTime");

  const STORAGE_KEYS = {
    count: "youtubeOpenCount",
    time: "activeYouTubeTimeMs",
    date: "youtubeOpenDate"
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

  function updateMetricsDisplay({ storedCount, storedTime, storedDate }) {
    const today = getTodayDateString();
    const isToday = storedDate === today;
    const youtubeOpenCount = isToday ? Number(storedCount ?? 0) : 0;
    const activeYouTubeTimeMs = isToday ? Number(storedTime ?? 0) : 0;

    openCountEl.textContent = String(
      Number.isFinite(youtubeOpenCount) ? youtubeOpenCount : 0
    );
    activeTimeEl.textContent = formatMsAsClock(activeYouTubeTimeMs);
  }

  function readAndRender() {
    chrome.storage.local.get(
      [STORAGE_KEYS.count, STORAGE_KEYS.time, STORAGE_KEYS.date],
      (data) => {
        updateMetricsDisplay({
          storedCount: data[STORAGE_KEYS.count],
          storedTime: data[STORAGE_KEYS.time],
          storedDate: data[STORAGE_KEYS.date]
        });
      }
    );
  }

  // Initial render.
  readAndRender();

  // Live update while the popup is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const changedKeys = Object.keys(changes || {});
    const relevant =
      changedKeys.includes(STORAGE_KEYS.count) ||
      changedKeys.includes(STORAGE_KEYS.time) ||
      changedKeys.includes(STORAGE_KEYS.date);

    if (relevant) readAndRender();
  });
});

