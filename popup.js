// popup.js - YouTube Tracker
// Shows the "YouTube opens today" count from chrome.storage.local.

document.addEventListener("DOMContentLoaded", () => {
  console.log("[YouTube Tracker] Popup loaded.");

  const countEl = document.getElementById("count");

  const STORAGE_KEYS = {
    count: "youtubeOpenCount",
    date: "youtubeOpenDate"
  };

  function getTodayDateString() {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function updateCountDisplay({ storedCount, storedDate }) {
    const today = getTodayDateString();
    const isToday = storedDate === today;
    const count = isToday ? Number(storedCount ?? 0) : 0;
    countEl.textContent = String(Number.isFinite(count) ? count : 0);
  }

  chrome.storage.local.get([STORAGE_KEYS.count, STORAGE_KEYS.date], (data) => {
    updateCountDisplay({
      storedCount: data[STORAGE_KEYS.count],
      storedDate: data[STORAGE_KEYS.date]
    });
  });

  // Live update while the popup is open.
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const nextCount =
      changes[STORAGE_KEYS.count]?.newValue ?? undefined;
    const nextDate =
      changes[STORAGE_KEYS.date]?.newValue ?? undefined;

    // If either key changed, re-read both for a consistent view.
    if (nextCount !== undefined || nextDate !== undefined) {
      chrome.storage.local.get(
        [STORAGE_KEYS.count, STORAGE_KEYS.date],
        (data) => {
          updateCountDisplay({
            storedCount: data[STORAGE_KEYS.count],
            storedDate: data[STORAGE_KEYS.date]
          });
        }
      );
    }
  });
});

