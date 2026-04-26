// dashboard.js - YouTube Tracker
// Renders simple charts for the last 7 days using Chart.js.

import {
  formatMsAsClock,
  formatMsAsHoursMinutes,
  formatMsForTooltip,
  getTodayDateString,
  getYouTubePageTypeLabel,
  msToDecimalHours
} from "./utils.js";

const RECENT_SESSIONS_LIMIT = 5;

function formatSessionTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function renderRecentSessions(sessionHistory) {
  const recentSessionsList = document.getElementById("recent-sessions-list");
  const recentSessionsSummary = document.getElementById("recent-sessions-summary");

  if (!recentSessionsList || !recentSessionsSummary) {
    return;
  }

  recentSessionsList.textContent = "";

  if (!sessionHistory.length) {
    recentSessionsSummary.textContent = "No completed YouTube sessions yet.";
    const emptyItem = document.createElement("li");
    emptyItem.className = "recent-session-empty";
    emptyItem.textContent = "No completed YouTube sessions yet.";
    recentSessionsList.append(emptyItem);
    return;
  }

  const recentSessions = [...sessionHistory]
    .sort((sessionA, sessionB) => Number(sessionB.endedAt) - Number(sessionA.endedAt))
    .slice(0, RECENT_SESSIONS_LIMIT);
  const recentSessionsTotalMs = recentSessions.reduce(
    (sum, session) => sum + Math.max(0, Number(session.durationMs) || 0),
    0
  );

  recentSessionsSummary.textContent = `${recentSessions.length} recent sessions, ${formatMsAsHoursMinutes(
    recentSessionsTotalMs
  )} total.`;

  recentSessions.forEach((session) => {
    const item = document.createElement("li");
    item.className = "recent-session-item";

    const topRow = document.createElement("div");
    topRow.className = "recent-session-row";

    const pageType = document.createElement("span");
    pageType.className = "recent-session-page-type";
    pageType.textContent = getYouTubePageTypeLabel(session.pageType) || "YouTube";

    const duration = document.createElement("span");
    duration.className = "recent-session-duration";
    duration.textContent = formatMsAsHoursMinutes(session.durationMs);

    topRow.append(pageType, duration);

    const bottomRow = document.createElement("div");
    bottomRow.className = "recent-session-row";

    const startedAt = Number(session.startedAt);
    const endedAt = Number(session.endedAt);
    const timeRange = document.createElement("span");
    timeRange.className = "recent-session-time";
    timeRange.textContent = `${formatSessionTimestamp(startedAt)} to ${formatSessionTimestamp(
      endedAt
    )}`;

    bottomRow.append(timeRange);

    item.append(topRow, bottomRow);
    recentSessionsList.append(item);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const summaryOpens = document.getElementById("summary-opens");
  const summaryFocused = document.getElementById("summary-focused");
  const summaryShorts = document.getElementById("summary-shorts");
  const summaryWatch = document.getElementById("summary-watch");
  const summaryBrowse = document.getElementById("summary-browse");
  const weeklySummary = document.getElementById("weekly-summary");

  chrome.storage.local.get(["dailyStats", "sessionHistory"], (data) => {
    const dailyStats = data.dailyStats || {};
    const sessionHistory = Array.isArray(data.sessionHistory) ? data.sessionHistory : [];
    const entries = Object.entries(dailyStats);
    renderRecentSessions(sessionHistory);

    // Sort dates ascending.
    entries.sort(([dateA], [dateB]) => (dateA < dateB ? -1 : dateA > dateB ? 1 : 0));

    // Keep only last 7 days.
    const last7 = entries.slice(-7);

    const labels = [];
    const focusedTimeMs = [];
    const opensCounts = [];
    const shortsMs = [];
    const watchMs = [];
    const browseMs = [];

    last7.forEach(([date, stats]) => {
      labels.push(date);
      const s = stats || {};
      focusedTimeMs.push(Number(s.activeYouTubeTimeMs ?? 0));
      opensCounts.push(Number(s.youtubeOpenCount ?? 0));
      shortsMs.push(Number(s.shortsFocusedTimeMs ?? 0));
      watchMs.push(Number(s.watchFocusedTimeMs ?? 0));
      browseMs.push(Number(s.browseFocusedTimeMs ?? 0));
    });

    const weeklyTotalFocusedMs = focusedTimeMs.reduce((sum, value) => sum + value, 0);
    const weeklyTotalOpens = opensCounts.reduce((sum, value) => sum + value, 0);
    if (weeklySummary) {
      weeklySummary.textContent = `You spent ${formatMsAsHoursMinutes(
        weeklyTotalFocusedMs
      )} on YouTube this week across ${weeklyTotalOpens} opens.`;
    }

    // Summary for today.
    const today = getTodayDateString();
    const todayStats = dailyStats[today] || {};
    summaryOpens.textContent = String(todayStats.youtubeOpenCount ?? 0);
    summaryFocused.textContent = formatMsAsClock(todayStats.activeYouTubeTimeMs ?? 0);
    summaryShorts.textContent = formatMsAsClock(todayStats.shortsFocusedTimeMs ?? 0);
    summaryWatch.textContent = formatMsAsClock(todayStats.watchFocusedTimeMs ?? 0);
    summaryBrowse.textContent = formatMsAsClock(todayStats.browseFocusedTimeMs ?? 0);

    // YouTube time chart (ms -> hours on y-axis).
    const focusedCtx = document.getElementById("focusedTimeChart").getContext("2d");
    new Chart(focusedCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "YouTube time",
            data: focusedTimeMs.map(msToDecimalHours),
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.2)",
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb"
            }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const index = context.dataIndex;
                return `YouTube time: ${formatMsForTooltip(focusedTimeMs[index])}`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#9ca3af" },
            grid: { color: "rgba(55,65,81,0.5)" }
          },
          y: {
            ticks: { color: "#9ca3af" },
            title: {
              display: true,
              text: "Hours",
              color: "#9ca3af"
            },
            grid: { color: "rgba(55,65,81,0.5)" }
          }
        }
      }
    });

    // Opens chart.
    const opensCtx = document.getElementById("opensChart").getContext("2d");
    new Chart(opensCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "YouTube opens",
            data: opensCounts,
            backgroundColor: "#4ade80",
            borderColor: "#22c55e",
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb"
            }
          }
        },
        scales: {
          x: {
            ticks: { color: "#9ca3af" },
            grid: { color: "rgba(55,65,81,0.5)" }
          },
          y: {
            ticks: { color: "#9ca3af" },
            title: {
              display: true,
              text: "Opens",
              color: "#9ca3af"
            },
            grid: { color: "rgba(55,65,81,0.5)" }
          }
        }
      }
    });

    // Breakdown chart (stacked bars for shorts/watch/browse).
    const breakdownCtx = document
      .getElementById("breakdownChart")
      .getContext("2d");
    new Chart(breakdownCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Shorts time",
            data: shortsMs.map(msToDecimalHours),
            backgroundColor: "#f97316"
          },
          {
            label: "Watch time",
            data: watchMs.map(msToDecimalHours),
            backgroundColor: "#6366f1"
          },
          {
            label: "Browse time",
            data: browseMs.map(msToDecimalHours),
            backgroundColor: "#22c55e"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb"
            }
          },
          tooltip: {
            callbacks: {
              label(context) {
                const index = context.dataIndex;
                if (context.dataset.label === "Shorts time") {
                  return `Shorts time: ${formatMsForTooltip(shortsMs[index])}`;
                }
                if (context.dataset.label === "Watch time") {
                  return `Watch time: ${formatMsForTooltip(watchMs[index])}`;
                }
                return `Browse time: ${formatMsForTooltip(browseMs[index])}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: "#9ca3af" },
            grid: { color: "rgba(55,65,81,0.5)" }
          },
          y: {
            stacked: true,
            ticks: { color: "#9ca3af" },
            title: {
              display: true,
              text: "Hours",
              color: "#9ca3af"
            },
            grid: { color: "rgba(55,65,81,0.5)" }
          }
        }
      }
    });
  });
});
