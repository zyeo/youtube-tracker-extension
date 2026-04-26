import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFocusedYouTubeSessionToDailyStats,
  createSessionHistoryRecord,
  formatDateString,
  formatMsAsClock,
  formatMsAsHoursMinutes,
  formatMsForTooltip,
  getDailyGoalProgress,
  getDailyGoalNotificationDates,
  getElapsedSessionMs,
  getYouTubePageType,
  getYouTubePageTypeLabel,
  msToDecimalHours,
  normalizeDailyGoalMinutes,
  normalizeRetentionDays,
  pruneDailyStats,
  pruneSessionHistory,
  shouldNotifyDailyGoalExceeded
} from "../utils.js";

test("getYouTubePageType classifies YouTube pages", () => {
  assert.equal(getYouTubePageType("https://www.youtube.com/shorts/abc123"), "shorts");
  assert.equal(getYouTubePageType("https://youtube.com/watch?v=abc123"), "watch");
  assert.equal(getYouTubePageType("https://m.youtube.com/results?search_query=test"), "browse");
  assert.equal(getYouTubePageType("https://www.youtube.com/"), "browse");
});

test("getYouTubePageType rejects unsupported hosts and invalid URLs", () => {
  assert.equal(getYouTubePageType("https://music.youtube.com/watch?v=abc123"), null);
  assert.equal(getYouTubePageType("https://example.com/watch?v=abc123"), null);
  assert.equal(getYouTubePageType("not a url"), null);
  assert.equal(getYouTubePageType(""), null);
  assert.equal(getYouTubePageType(null), null);
});

test("getYouTubePageTypeLabel formats popup-friendly labels", () => {
  assert.equal(getYouTubePageTypeLabel("shorts"), "Shorts");
  assert.equal(getYouTubePageTypeLabel("watch"), "Watch");
  assert.equal(getYouTubePageTypeLabel("browse"), "Browse");
  assert.equal(getYouTubePageTypeLabel(null), "");
});

test("formatDateString formats local calendar dates as yyyy-mm-dd", () => {
  assert.equal(formatDateString(new Date(2026, 0, 2)), "2026-01-02");
  assert.equal(formatDateString(new Date(2026, 10, 12)), "2026-11-12");
});

test("applyFocusedYouTubeSessionToDailyStats adds elapsed time to matching bucket", () => {
  const dailyStats = {
    "2026-04-26": {
      youtubeOpenCount: 2,
      activeYouTubeTimeMs: 1_000,
      shortsFocusedTimeMs: 0,
      watchFocusedTimeMs: 1_000,
      browseFocusedTimeMs: 0
    }
  };

  const nextDailyStats = applyFocusedYouTubeSessionToDailyStats(dailyStats, {
    startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
    endedAt: new Date(2026, 3, 26, 10, 0, 5).getTime(),
    pageType: "shorts"
  });

  assert.notEqual(nextDailyStats, dailyStats);
  assert.deepEqual(dailyStats["2026-04-26"], {
    youtubeOpenCount: 2,
    activeYouTubeTimeMs: 1_000,
    shortsFocusedTimeMs: 0,
    watchFocusedTimeMs: 1_000,
    browseFocusedTimeMs: 0
  });
  assert.deepEqual(nextDailyStats["2026-04-26"], {
    youtubeOpenCount: 2,
    activeYouTubeTimeMs: 6_000,
    shortsFocusedTimeMs: 5_000,
    watchFocusedTimeMs: 1_000,
    browseFocusedTimeMs: 0
  });
});

test("applyFocusedYouTubeSessionToDailyStats initializes missing fields", () => {
  const nextDailyStats = applyFocusedYouTubeSessionToDailyStats(
    {
      "2026-04-26": {
        youtubeOpenCount: 1
      }
    },
    {
      startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
      endedAt: new Date(2026, 3, 26, 10, 0, 3).getTime(),
      pageType: "watch"
    }
  );

  assert.deepEqual(nextDailyStats["2026-04-26"], {
    youtubeOpenCount: 1,
    activeYouTubeTimeMs: 3_000,
    shortsFocusedTimeMs: 0,
    watchFocusedTimeMs: 3_000,
    browseFocusedTimeMs: 0
  });
});

test("applyFocusedYouTubeSessionToDailyStats splits sessions across local dates", () => {
  const nextDailyStats = applyFocusedYouTubeSessionToDailyStats({}, {
    startedAt: new Date(2026, 3, 26, 23, 59, 58).getTime(),
    endedAt: new Date(2026, 3, 27, 0, 0, 2).getTime(),
    pageType: "browse"
  });

  assert.deepEqual(nextDailyStats["2026-04-26"], {
    youtubeOpenCount: 0,
    activeYouTubeTimeMs: 2_000,
    shortsFocusedTimeMs: 0,
    watchFocusedTimeMs: 0,
    browseFocusedTimeMs: 2_000
  });
  assert.deepEqual(nextDailyStats["2026-04-27"], {
    youtubeOpenCount: 0,
    activeYouTubeTimeMs: 2_000,
    shortsFocusedTimeMs: 0,
    watchFocusedTimeMs: 0,
    browseFocusedTimeMs: 2_000
  });
});

test("pruneDailyStats retains entries in the 90-day window", () => {
  const dailyStats = {
    "2026-01-27": { youtubeOpenCount: 1 },
    "2026-04-26": { youtubeOpenCount: 2 }
  };

  assert.deepEqual(pruneDailyStats(dailyStats, new Date(2026, 3, 26)), dailyStats);
});

test("normalizeRetentionDays keeps the default and clamps invalid values", () => {
  assert.equal(normalizeRetentionDays(undefined), 90);
  assert.equal(normalizeRetentionDays(null), 90);
  assert.equal(normalizeRetentionDays(""), 90);
  assert.equal(normalizeRetentionDays("   "), 90);
  assert.equal(normalizeRetentionDays(30.8), 30);
  assert.equal(normalizeRetentionDays(0), 90);
  assert.equal(normalizeRetentionDays(-5), 90);
});

test("normalizeDailyGoalMinutes keeps the default and clamps invalid values", () => {
  assert.equal(normalizeDailyGoalMinutes(undefined), 60);
  assert.equal(normalizeDailyGoalMinutes(null), 60);
  assert.equal(normalizeDailyGoalMinutes(""), 60);
  assert.equal(normalizeDailyGoalMinutes("   "), 60);
  assert.equal(normalizeDailyGoalMinutes(45.9), 45);
  assert.equal(normalizeDailyGoalMinutes(0), 60);
  assert.equal(normalizeDailyGoalMinutes(-5), 60);
});

test("getDailyGoalProgress calculates unclamped text and clamped bar progress", () => {
  assert.deepEqual(getDailyGoalProgress(15 * 60_000, 60), {
    dailyGoalMinutes: 60,
    progressPct: 25,
    clampedProgressPct: 25
  });
  assert.deepEqual(getDailyGoalProgress(75 * 60_000, 60), {
    dailyGoalMinutes: 60,
    progressPct: 125,
    clampedProgressPct: 100
  });
  assert.deepEqual(getDailyGoalProgress(-1, 0), {
    dailyGoalMinutes: 60,
    progressPct: 0,
    clampedProgressPct: 0
  });
});

test("shouldNotifyDailyGoalExceeded only fires on the first crossing", () => {
  assert.equal(
    shouldNotifyDailyGoalExceeded(59 * 60_000, 60 * 60_000, 60, false),
    true
  );
  assert.equal(
    shouldNotifyDailyGoalExceeded(60 * 60_000, 61 * 60_000, 60, false),
    false
  );
  assert.equal(
    shouldNotifyDailyGoalExceeded(30 * 60_000, 59 * 60_000, 60, false),
    false
  );
  assert.equal(
    shouldNotifyDailyGoalExceeded(59 * 60_000, 61 * 60_000, 60, true),
    false
  );
  assert.equal(
    shouldNotifyDailyGoalExceeded(-1, 60 * 60_000, 0, false),
    true
  );
});

test("getDailyGoalNotificationDates finds same-day and cross-midnight crossings", () => {
  const previousDailyStats = {
    "2026-04-25": { activeYouTubeTimeMs: 59 * 60_000 },
    "2026-04-26": { activeYouTubeTimeMs: 10 * 60_000 }
  };
  const nextDailyStats = {
    "2026-04-25": { activeYouTubeTimeMs: 60 * 60_000 },
    "2026-04-26": { activeYouTubeTimeMs: 61 * 60_000 }
  };

  assert.deepEqual(
    getDailyGoalNotificationDates(previousDailyStats, nextDailyStats, 60, {}),
    ["2026-04-25", "2026-04-26"]
  );
  assert.deepEqual(
    getDailyGoalNotificationDates(previousDailyStats, nextDailyStats, 60, {
      "2026-04-25": true
    }),
    ["2026-04-26"]
  );
  assert.deepEqual(
    getDailyGoalNotificationDates(nextDailyStats, nextDailyStats, 60, {
      "2026-04-25": "pending",
      "2026-04-26": true
    }),
    ["2026-04-25"]
  );
});

test("pruneDailyStats drops old and malformed date keys", () => {
  const dailyStats = {
    "2026-01-26": { youtubeOpenCount: 1 },
    "2026-01-27": { youtubeOpenCount: 2 },
    "2026-02-30": { youtubeOpenCount: 3 },
    notADate: { youtubeOpenCount: 4 }
  };

  assert.deepEqual(pruneDailyStats(dailyStats, new Date(2026, 3, 26)), {
    "2026-01-27": { youtubeOpenCount: 2 }
  });
});

test("pruneDailyStats uses a custom retention window", () => {
  const dailyStats = {
    "2026-04-19": { youtubeOpenCount: 1 },
    "2026-04-20": { youtubeOpenCount: 2 },
    "2026-04-26": { youtubeOpenCount: 3 }
  };

  assert.deepEqual(pruneDailyStats(dailyStats, new Date(2026, 3, 26), 7), {
    "2026-04-20": { youtubeOpenCount: 2 },
    "2026-04-26": { youtubeOpenCount: 3 }
  });
});

test("pruneDailyStats preserves fields for retained days", () => {
  const retainedStats = {
    youtubeOpenCount: 3,
    activeYouTubeTimeMs: 4_000,
    shortsFocusedTimeMs: 1_000,
    watchFocusedTimeMs: 2_000,
    browseFocusedTimeMs: 1_000
  };
  const dailyStats = {
    "2026-01-26": { youtubeOpenCount: 1 },
    "2026-04-26": retainedStats
  };

  assert.deepEqual(pruneDailyStats(dailyStats, new Date(2026, 3, 26)), {
    "2026-04-26": retainedStats
  });
});

test("createSessionHistoryRecord returns a compact completed session record", () => {
  assert.deepEqual(
    createSessionHistoryRecord(
      {
        startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
        pageType: "watch",
        url: "https://www.youtube.com/watch?v=abc123"
      },
      new Date(2026, 3, 26, 10, 5, 0).getTime()
    ),
    {
      startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
      endedAt: new Date(2026, 3, 26, 10, 5, 0).getTime(),
      durationMs: 5 * 60_000,
      pageType: "watch"
    }
  );
});

test("createSessionHistoryRecord rejects invalid sessions", () => {
  assert.equal(
    createSessionHistoryRecord(
      {
        startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
        pageType: "watch"
      },
      new Date(2026, 3, 26, 10, 0, 0).getTime()
    ),
    null
  );
  assert.equal(
    createSessionHistoryRecord(
      {
        startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
        pageType: "channel"
      },
      new Date(2026, 3, 26, 10, 5, 0).getTime()
    ),
    null
  );
});

test("pruneSessionHistory retains records in the local retention window", () => {
  const retainedHistory = [
    {
      startedAt: new Date(2026, 3, 20, 10, 0, 0).getTime(),
      endedAt: new Date(2026, 3, 20, 10, 15, 0).getTime(),
      durationMs: 15 * 60_000,
      pageType: "browse"
    },
    {
      startedAt: new Date(2026, 3, 26, 10, 0, 0).getTime(),
      endedAt: new Date(2026, 3, 26, 10, 5, 0).getTime(),
      durationMs: 5 * 60_000,
      pageType: "watch"
    }
  ];

  assert.deepEqual(
    pruneSessionHistory(retainedHistory, new Date(2026, 3, 26), 7),
    retainedHistory
  );
});

test("pruneSessionHistory drops old and malformed records", () => {
  assert.deepEqual(
    pruneSessionHistory(
      [
        {
          startedAt: new Date(2026, 3, 19, 23, 59, 0).getTime(),
          endedAt: new Date(2026, 3, 19, 23, 59, 30).getTime(),
          durationMs: 30_000,
          pageType: "watch"
        },
        {
          startedAt: new Date(2026, 3, 20, 0, 0, 0).getTime(),
          endedAt: new Date(2026, 3, 20, 0, 10, 0).getTime(),
          durationMs: 10 * 60_000,
          pageType: "shorts"
        },
        {
          startedAt: new Date(2026, 3, 26, 11, 0, 0).getTime(),
          durationMs: 2 * 60_000,
          pageType: "browse"
        },
        {
          startedAt: new Date(2026, 3, 26, 12, 0, 0).getTime(),
          endedAt: new Date(2026, 3, 26, 12, 5, 0).getTime(),
          durationMs: 5 * 60_000,
          pageType: "channel"
        },
        {
          startedAt: new Date(2026, 3, 26, 13, 0, 0).getTime(),
          endedAt: new Date(2026, 3, 26, 13, 5, 0).getTime(),
          durationMs: 1_000,
          pageType: "browse"
        },
        {
          startedAt: "bad",
          endedAt: "bad",
          durationMs: 1_000,
          pageType: "watch"
        }
      ],
      new Date(2026, 3, 26),
      7
    ),
    [
      {
        startedAt: new Date(2026, 3, 20, 0, 0, 0).getTime(),
        endedAt: new Date(2026, 3, 20, 0, 10, 0).getTime(),
        durationMs: 10 * 60_000,
        pageType: "shorts"
      }
    ]
  );
});

test("formatMsAsClock formats durations below and above an hour", () => {
  assert.equal(formatMsAsClock(0), "00:00");
  assert.equal(formatMsAsClock(59_999), "00:59");
  assert.equal(formatMsAsClock(60_000), "01:00");
  assert.equal(formatMsAsClock(3_600_000), "01:00:00");
  assert.equal(formatMsAsClock(3_661_000), "01:01:01");
  assert.equal(formatMsAsClock(null), "00:00");
});

test("getElapsedSessionMs clamps invalid and past-now values", () => {
  assert.equal(getElapsedSessionMs(1_000, 5_000), 4_000);
  assert.equal(getElapsedSessionMs(5_000, 1_000), 0);
  assert.equal(getElapsedSessionMs(null, 1_000), 0);
});

test("msToDecimalHours rounds to two decimal places", () => {
  assert.equal(msToDecimalHours(0), 0);
  assert.equal(msToDecimalHours(30 * 60_000), 0.5);
  assert.equal(msToDecimalHours(90 * 60_000), 1.5);
  assert.equal(msToDecimalHours(1_000), 0);
  assert.equal(msToDecimalHours(null), 0);
});

test("formatMsForTooltip formats floored minute totals", () => {
  assert.equal(formatMsForTooltip(59_999), "0m");
  assert.equal(formatMsForTooltip(59 * 60_000), "59m");
  assert.equal(formatMsForTooltip(60 * 60_000), "1h 0m");
  assert.equal(formatMsForTooltip(125 * 60_000), "2h 5m");
  assert.equal(formatMsForTooltip(null), "0m");
});

test("formatMsAsHoursMinutes formats minutes and hours", () => {
  assert.equal(formatMsAsHoursMinutes(0), "0m");
  assert.equal(formatMsAsHoursMinutes(59 * 60_000), "59m");
  assert.equal(formatMsAsHoursMinutes(60 * 60_000), "1h 0m");
  assert.equal(formatMsAsHoursMinutes(125 * 60_000), "2h 5m");
  assert.equal(formatMsAsHoursMinutes(null), "0m");
});
