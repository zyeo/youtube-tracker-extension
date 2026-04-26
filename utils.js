function formatDateString(date) {
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
