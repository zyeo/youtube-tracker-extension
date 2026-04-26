// content.js - YouTube Tracker
// Watches YouTube's SPA navigation and tells the background worker when the URL changes.

(function () {
  console.log("[YouTube Tracker] content.js is running on this YouTube page.");

  const ROUTE_CHANGED_MESSAGE = "youtube-route-changed";
  let lastUrl = window.location.href;
  let notifyTimer = null;

  function sendRouteChanged(url) {
    if (
      typeof chrome === "undefined" ||
      !chrome.runtime ||
      !chrome.runtime.sendMessage
    ) {
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: ROUTE_CHANGED_MESSAGE,
        url
      });
    } catch (error) {
      console.debug("[YouTube Tracker] Could not send route change.", error);
    }
  }

  function notifyIfUrlChanged() {
    notifyTimer = null;

    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) {
      return;
    }

    lastUrl = currentUrl;
    sendRouteChanged(currentUrl);
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

  window.setInterval(scheduleRouteCheck, 1000);
})();
