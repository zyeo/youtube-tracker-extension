// content.js - YouTube Tracker
// Watches YouTube SPA navigation and video playback state.

(function () {
  console.log("[YouTube Tracker] content.js is running on this YouTube page.");

  const ROUTE_CHANGED_MESSAGE = "youtube-route-changed";
  const ENGAGEMENT_CHANGED_MESSAGE = "youtube-engagement-changed";
  let lastUrl = window.location.href;
  let notifyTimer = null;
  let engagementMessageTimer = null;
  let activeVideo = null;
  let lastEngagementSnapshot = null;

  function sendMessage(message) {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      !chrome.runtime.sendMessage
    ) {
      return;
    }

    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.debug("[YouTube Tracker] Could not send message.", error);
    }
  }

  function sendRouteChanged(url) {
    sendMessage({
      type: ROUTE_CHANGED_MESSAGE,
      url
    });
  }

  function getActiveVideo() {
    const player = document.querySelector("#movie_player");
    if (player) {
      const playerVideo = player.querySelector("video");
      if (playerVideo) {
        return playerVideo;
      }
    }

    return document.querySelector("video");
  }

  function buildEngagementSnapshot() {
    const video = getActiveVideo();
    const hasVideo = Boolean(video);

    return {
      url: window.location.href,
      isVideoPlaying: hasVideo
        ? !video.paused && !video.ended && video.readyState > 2
        : false,
      hasVideo
    };
  }

  function syncActiveVideo() {
    const nextVideo = getActiveVideo();
    if (nextVideo === activeVideo) {
      return false;
    }

    if (activeVideo) {
      activeVideo.removeEventListener("play", scheduleEngagementUpdate);
      activeVideo.removeEventListener("playing", scheduleEngagementUpdate);
      activeVideo.removeEventListener("pause", scheduleEngagementUpdate);
      activeVideo.removeEventListener("ended", scheduleEngagementUpdate);
      activeVideo.removeEventListener("emptied", scheduleEngagementUpdate);
    }

    activeVideo = nextVideo;

    if (activeVideo) {
      activeVideo.addEventListener("play", scheduleEngagementUpdate);
      activeVideo.addEventListener("playing", scheduleEngagementUpdate);
      activeVideo.addEventListener("pause", scheduleEngagementUpdate);
      activeVideo.addEventListener("ended", scheduleEngagementUpdate);
      activeVideo.addEventListener("emptied", scheduleEngagementUpdate);
    }

    return true;
  }

  function sendEngagementChanged() {
    const snapshot = buildEngagementSnapshot();
    if (
      lastEngagementSnapshot &&
      lastEngagementSnapshot.url === snapshot.url &&
      lastEngagementSnapshot.isVideoPlaying === snapshot.isVideoPlaying &&
      lastEngagementSnapshot.hasVideo === snapshot.hasVideo
    ) {
      return;
    }

    lastEngagementSnapshot = snapshot;
    sendMessage({
      type: ENGAGEMENT_CHANGED_MESSAGE,
      ...snapshot
    });
  }

  function flushEngagementUpdate() {
    engagementMessageTimer = null;
    syncActiveVideo();
    sendEngagementChanged();
  }

  function scheduleEngagementUpdate() {
    if (engagementMessageTimer !== null) {
      return;
    }

    engagementMessageTimer = window.setTimeout(flushEngagementUpdate, 0);
  }

  function notifyIfUrlChanged() {
    notifyTimer = null;

    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) {
      if (syncActiveVideo()) {
        sendEngagementChanged();
      }
      return;
    }

    lastUrl = currentUrl;
    sendRouteChanged(currentUrl);
    scheduleEngagementUpdate();
  }

  function scheduleRouteCheck() {
    if (notifyTimer !== null) {
      return;
    }

    notifyTimer = window.setTimeout(notifyIfUrlChanged, 0);
  }

  function wrapHistoryMethod(methodName) {
    const originalMethod = window.history[methodName];

    window.history[methodName] = function (...args) {
      const result = originalMethod.apply(this, args);
      scheduleRouteCheck();
      return result;
    };
  }

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");

  window.addEventListener("popstate", scheduleRouteCheck);
  window.addEventListener("yt-navigate-finish", scheduleRouteCheck);

  syncActiveVideo();
  sendEngagementChanged();
  window.setInterval(scheduleRouteCheck, 1000);
})();
