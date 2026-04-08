// dashboard.js - YouTube Tracker
// Renders simple charts for the last 7 days using Chart.js.

document.addEventListener("DOMContentLoaded", () => {
  const summaryOpens = document.getElementById("summary-opens");
  const summaryFocused = document.getElementById("summary-focused");
  const summaryShorts = document.getElementById("summary-shorts");
  const summaryWatch = document.getElementById("summary-watch");
  const summaryBrowse = document.getElementById("summary-browse");

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
      const mm = String(minutesTotal).padStart(2, "0");
      const ss = String(seconds).padStart(2, "0");
      return `${mm}:${ss}`;
    }

    const hh = String(Math.floor(minutesTotal / 60)).padStart(2, "0");
    const mm = String(minutesTotal % 60).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function msToDecimalHours(ms) {
    return Math.round((Number(ms ?? 0) / 3600000) * 100) / 100;
  }

  function formatMsForTooltip(ms) {
    const totalMinutes = Math.floor(Number(ms ?? 0) / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
  }

  chrome.storage.local.get(["dailyStats"], (data) => {
    const dailyStats = data.dailyStats || {};
    const entries = Object.entries(dailyStats);

    if (!entries.length) {
      return;
    }

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

    // Summary for today.
    const today = getTodayDateString();
    const todayStats = dailyStats[today] || {};
    summaryOpens.textContent = String(todayStats.youtubeOpenCount ?? 0);
    summaryFocused.textContent = formatMsAsClock(todayStats.activeYouTubeTimeMs ?? 0);
    summaryShorts.textContent = formatMsAsClock(todayStats.shortsFocusedTimeMs ?? 0);
    summaryWatch.textContent = formatMsAsClock(todayStats.watchFocusedTimeMs ?? 0);
    summaryBrowse.textContent = formatMsAsClock(todayStats.browseFocusedTimeMs ?? 0);

    // Focused time chart (total focused ms -> hours).
    const focusedCtx = document.getElementById("focusedTimeChart").getContext("2d");
    new Chart(focusedCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Focused time",
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
                return `Focused time: ${formatMsForTooltip(focusedTimeMs[index])}`;
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
            label: "Shorts",
            data: shortsMs.map(msToDecimalHours),
            backgroundColor: "#f97316"
          },
          {
            label: "Watch",
            data: watchMs.map(msToDecimalHours),
            backgroundColor: "#6366f1"
          },
          {
            label: "Browse",
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
                if (context.dataset.label === "Shorts") {
                  return `Shorts: ${formatMsForTooltip(shortsMs[index])}`;
                }
                if (context.dataset.label === "Watch") {
                  return `Watch: ${formatMsForTooltip(watchMs[index])}`;
                }
                return `Browse: ${formatMsForTooltip(browseMs[index])}`;
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

