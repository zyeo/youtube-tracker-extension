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

const EMPTY_DAILY_STATS_ENTRY = {
  youtubeOpenCount: 0,
  activeYouTubeTimeMs: 0,
  shortsFocusedTimeMs: 0,
  watchFocusedTimeMs: 0,
  browseFocusedTimeMs: 0
};

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
