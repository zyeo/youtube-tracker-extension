import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFocusedYouTubeSessionToDailyStats,
  formatDateString,
  formatMsAsClock,
  formatMsAsHoursMinutes,
  formatMsForTooltip,
  getYouTubePageType,
  msToDecimalHours
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

test("formatMsAsClock formats durations below and above an hour", () => {
  assert.equal(formatMsAsClock(0), "00:00");
  assert.equal(formatMsAsClock(59_999), "00:59");
  assert.equal(formatMsAsClock(60_000), "01:00");
  assert.equal(formatMsAsClock(3_600_000), "01:00:00");
  assert.equal(formatMsAsClock(3_661_000), "01:01:01");
  assert.equal(formatMsAsClock(null), "00:00");
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
