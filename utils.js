export function formatDateString(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Determine YouTube page type based on URL.
 * - "shorts" for youtube.com/shorts/*
 * - "watch" for youtube.com/watch*
 * - "browse" for other youtube.com pages (home, subscriptions, search, etc.)
 * - null for non-YouTube URLs
 * @param {string} url
 * @returns {"shorts" | "watch" | "browse" | null}
 */
export function getYouTubePageType(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname || "";
    const path = parsed.pathname || "";

    // Check YouTube host
    const isYouTubeHost =
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com";

    if (!isYouTubeHost) {
      return null;
    }

    // Shorts: /shorts/...
    if (path.startsWith("/shorts/")) {
      return "shorts";
    }

    // Regular watch page: /watch
    if (path.startsWith("/watch")) {
      return "watch";
    }

    // Other YouTube pages (home, subscriptions, search, etc.)
    return "browse";
  } catch (e) {
    // If URL parsing fails, treat as non-YouTube
    return null;
  }
}

export function getYouTubePageTypeLabel(pageType) {
  if (pageType === "shorts") return "Shorts";
  if (pageType === "watch") return "Watch";
  if (pageType === "browse") return "Browse";
  return "";
}

/**
 * Format today's date as YYYY-MM-DD in local time.
 * @returns {string}
 */
export function getTodayDateString() {
  return formatDateString(new Date());
}

export function getYesterdayDateString() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return formatDateString(now);
}

function isValidDailyStatsDateKey(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function normalizeRetentionDays(retentionDays, defaultValue = 90) {
  const defaultNumber = Number(defaultValue);
  const normalizedDefault = Math.max(
    1,
    Math.floor(Number.isFinite(defaultNumber) ? defaultNumber : 90)
  );
  if (retentionDays === null || String(retentionDays).trim() === "") {
    return normalizedDefault;
  }
  const retentionNumber = Number(retentionDays);
  if (!Number.isFinite(retentionNumber) || retentionNumber <= 0) {
    return normalizedDefault;
  }

  return Math.max(
    1,
    Math.floor(retentionNumber)
  );
}

export function normalizeDailyGoalMinutes(dailyGoalMinutes, defaultValue = 60) {
  const defaultNumber = Number(defaultValue);
  const normalizedDefault = Math.max(
    1,
    Math.floor(Number.isFinite(defaultNumber) ? defaultNumber : 60)
  );

  if (dailyGoalMinutes === null || String(dailyGoalMinutes).trim() === "") {
    return normalizedDefault;
  }

  const dailyGoalNumber = Number(dailyGoalMinutes);
  if (!Number.isFinite(dailyGoalNumber) || dailyGoalNumber <= 0) {
    return normalizedDefault;
  }

  return Math.max(
    1,
    Math.floor(dailyGoalNumber)
  );
}

function isValidSessionPageType(pageType) {
  return pageType === "shorts" || pageType === "watch" || pageType === "browse";
}

export function getDailyGoalProgress(focusedTimeMs, dailyGoalMinutes) {
  const normalizedGoalMinutes = normalizeDailyGoalMinutes(dailyGoalMinutes);
  const goalMs = normalizedGoalMinutes * 60_000;
  const focusedMs = Math.max(0, Number(focusedTimeMs) || 0);
  const progressPct = Math.round((focusedMs / goalMs) * 100);

  return {
    dailyGoalMinutes: normalizedGoalMinutes,
    progressPct,
    clampedProgressPct: Math.max(0, Math.min(progressPct, 100))
  };
}

export function shouldNotifyDailyGoalExceeded(
  previousMs,
  nextMs,
  goalMinutes,
  alreadyNotified
) {
  if (alreadyNotified) {
    return false;
  }

  const goalMs = normalizeDailyGoalMinutes(goalMinutes) * 60_000;
  const previousFocusedMs = Math.max(0, Number(previousMs) || 0);
  const nextFocusedMs = Math.max(0, Number(nextMs) || 0);

  return previousFocusedMs < goalMs && nextFocusedMs >= goalMs;
}

export function shouldCountYouTubeOpen({
  hadPreviousWindowState,
  previousWindowWasYouTube,
  isYouTube
}) {
  return Boolean(hadPreviousWindowState) && !previousWindowWasYouTube && Boolean(isYouTube);
}

export function getDailyGoalNotificationDates(
  previousDailyStats,
  nextDailyStats,
  goalMinutes,
  notifiedDates
) {
  const dates = new Set([
    ...Object.keys(previousDailyStats || {}),
    ...Object.keys(nextDailyStats || {})
  ]);
  const nextNotificationDates = [];

  for (const dateKey of dates) {
    const previousMs = previousDailyStats?.[dateKey]?.activeYouTubeTimeMs || 0;
    const nextMs = nextDailyStats?.[dateKey]?.activeYouTubeTimeMs || 0;
    const notificationState = notifiedDates && notifiedDates[dateKey];
    const alreadyNotified = notificationState === true;

    if (
      notificationState === "pending" &&
      !alreadyNotified &&
      Math.max(0, Number(nextMs) || 0) >= normalizeDailyGoalMinutes(goalMinutes) * 60_000
    ) {
      nextNotificationDates.push(dateKey);
      continue;
    }

    if (shouldNotifyDailyGoalExceeded(previousMs, nextMs, goalMinutes, alreadyNotified)) {
      nextNotificationDates.push(dateKey);
    }
  }

  return nextNotificationDates.sort();
}

/**
 * Keep dailyStats entries within the recent local-date retention window.
 * Non-YYYY-MM-DD keys are dropped because dailyStats is keyed by calendar date.
 * @param {object} dailyStats
 * @param {Date} asOfDate
 * @param {number} retentionDays
 * @returns {object}
 */
export function pruneDailyStats(dailyStats, asOfDate = new Date(), retentionDays = 90) {
  const daysToKeep = normalizeRetentionDays(retentionDays);
  const today = formatDateString(asOfDate);
  const cutoffDate = new Date(
    asOfDate.getFullYear(),
    asOfDate.getMonth(),
    asOfDate.getDate() - daysToKeep + 1
  );
  const cutoff = formatDateString(cutoffDate);
  const nextDailyStats = {};

  for (const [dateKey, stats] of Object.entries(dailyStats || {})) {
    if (isValidDailyStatsDateKey(dateKey) && dateKey >= cutoff && dateKey <= today) {
      nextDailyStats[dateKey] = stats;
    }
  }

  return nextDailyStats;
}

/**
 * Create a compact session history record from a completed active session.
 * @param {{startedAt: number, pageType: "shorts"|"watch"|"browse"}} activeSession
 * @param {number} endedAt
 * @returns {{startedAt: number, endedAt: number, durationMs: number, pageType: "shorts"|"watch"|"browse"} | null}
 */
export function createSessionHistoryRecord(activeSession, endedAt) {
  const startedAt = Number(activeSession && activeSession.startedAt);
  const endedAtNumber = Number(endedAt);
  const pageType = activeSession && activeSession.pageType;

  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAtNumber) ||
    endedAtNumber <= startedAt ||
    !isValidSessionPageType(pageType)
  ) {
    return null;
  }

  return {
    startedAt,
    endedAt: endedAtNumber,
    durationMs: endedAtNumber - startedAt,
    pageType
  };
}

/**
 * Keep compact session records within the recent local-date retention window.
 * @param {Array<object>} sessionHistory
 * @param {Date} asOfDate
 * @param {number} retentionDays
 * @returns {Array<object>}
 */
export function pruneSessionHistory(
  sessionHistory,
  asOfDate = new Date(),
  retentionDays = 90
) {
  const daysToKeep = normalizeRetentionDays(retentionDays);
  const cutoffMs = new Date(
    asOfDate.getFullYear(),
    asOfDate.getMonth(),
    asOfDate.getDate() - daysToKeep + 1
  ).getTime();
  const nextDayStartMs = new Date(
    asOfDate.getFullYear(),
    asOfDate.getMonth(),
    asOfDate.getDate() + 1
  ).getTime();

  if (!Array.isArray(sessionHistory)) {
    return [];
  }

  return sessionHistory.filter((record) => {
    const startedAt = Number(record && record.startedAt);
    const endedAt = Number(record && record.endedAt);
    const durationMs = Number(record && record.durationMs);

    return (
      Number.isFinite(startedAt) &&
      Number.isFinite(endedAt) &&
      Number.isFinite(durationMs) &&
      endedAt > startedAt &&
      durationMs === endedAt - startedAt &&
      isValidSessionPageType(record.pageType) &&
      endedAt >= cutoffMs &&
      endedAt < nextDayStartMs
    );
  });
}

const EMPTY_DAILY_STATS_ENTRY = {
  youtubeOpenCount: 0,
  activeYouTubeTimeMs: 0,
  shortsFocusedTimeMs: 0,
  watchFocusedTimeMs: 0,
  browseFocusedTimeMs: 0
};

export function getOpenCountTransitionUpdate({
  activeState,
  dailyStats,
  today,
  tab,
  isYouTube
}) {
  const nextActiveState = {
    windows: { ...((activeState && activeState.windows) || {}) },
    tabs: { ...((activeState && activeState.tabs) || {}) }
  };
  const windowKey = tab && typeof tab.windowId === "number"
    ? String(tab.windowId)
    : null;
  const hadPreviousWindowState = Boolean(
    windowKey &&
      Object.prototype.hasOwnProperty.call(nextActiveState.windows, windowKey)
  );
  const previousWindowWasYouTube = windowKey
    ? Boolean(nextActiveState.windows[windowKey])
    : false;

  if (windowKey) {
    nextActiveState.windows[windowKey] = Boolean(isYouTube);
  }

  if (tab && typeof tab.id === "number") {
    nextActiveState.tabs[String(tab.id)] = Boolean(isYouTube);
  }

  if (
    !shouldCountYouTubeOpen({
      hadPreviousWindowState,
      previousWindowWasYouTube,
      isYouTube
    })
  ) {
    return {
      activeState: nextActiveState,
      dailyStats: dailyStats || {},
      counted: false,
      count: null
    };
  }

  const nextDailyStats = { ...(dailyStats || {}) };
  const todayStats = {
    ...EMPTY_DAILY_STATS_ENTRY,
    ...(nextDailyStats[today] || {})
  };
  todayStats.youtubeOpenCount += 1;
  nextDailyStats[today] = todayStats;

  return {
    activeState: nextActiveState,
    dailyStats: nextDailyStats,
    counted: true,
    count: todayStats.youtubeOpenCount
  };
}

function getFocusedTimeBucket(pageType) {
  if (pageType === "shorts") return "shortsFocusedTimeMs";
  if (pageType === "watch") return "watchFocusedTimeMs";
  return "browseFocusedTimeMs";
}

function getNextLocalMidnightMs(ms) {
  const date = new Date(ms);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1
  ).getTime();
}

/**
 * Apply elapsed focused YouTube time to dailyStats without mutating input.
 * Splits elapsed time across local calendar days when a session spans midnight.
 * @param {object} dailyStats
 * @param {{startedAt: number, endedAt: number, pageType: "shorts"|"watch"|"browse"}} session
 * @returns {object}
 */
export function applyFocusedYouTubeSessionToDailyStats(dailyStats, session) {
  const startedAt = Number(session && session.startedAt);
  const endedAt = Number(session && session.endedAt);

  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) {
    return { ...(dailyStats || {}) };
  }

  const nextDailyStats = { ...(dailyStats || {}) };
  let cursorMs = startedAt;

  while (cursorMs < endedAt) {
    const day = formatDateString(new Date(cursorMs));
    const chunkEndMs = Math.min(endedAt, getNextLocalMidnightMs(cursorMs));
    const elapsedMs = chunkEndMs - cursorMs;
    const previousEntry = nextDailyStats[day] || {};
    const nextEntry = {
      ...EMPTY_DAILY_STATS_ENTRY,
      ...previousEntry
    };
    const bucket = getFocusedTimeBucket(session.pageType);

    nextEntry.activeYouTubeTimeMs += elapsedMs;
    nextEntry[bucket] += elapsedMs;
    nextDailyStats[day] = nextEntry;

    cursorMs = chunkEndMs;
  }

  return nextDailyStats;
}

export function formatMsAsClock(ms) {
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

export function getElapsedSessionMs(startedAt, now = Date.now()) {
  if (startedAt === null || startedAt === undefined) {
    return 0;
  }

  const startedAtNumber = Number(startedAt);
  const nowNumber = Number(now);

  if (!Number.isFinite(startedAtNumber) || !Number.isFinite(nowNumber)) {
    return 0;
  }

  return Math.max(0, nowNumber - startedAtNumber);
}

export function msToDecimalHours(ms) {
  return Math.round((Number(ms ?? 0) / 3600000) * 100) / 100;
}

export function formatMsForTooltip(ms) {
  const totalMinutes = Math.floor(Number(ms ?? 0) / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export function formatMsAsHoursMinutes(ms) {
  const totalMinutes = Math.floor(Number(ms ?? 0) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
