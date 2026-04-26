// options.js - YouTube Tracker

import { normalizeDailyGoalMinutes, normalizeRetentionDays } from "./utils.js";

const STORAGE_KEY_DAILY_GOAL_MINUTES = "dailyGoalMinutes";
const STORAGE_KEY_RETENTION_DAYS = "retentionDays";

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("settings-form");
  const dailyGoalInput = document.getElementById("daily-goal-minutes");
  const input = document.getElementById("retention-days");
  const status = document.getElementById("save-status");

  if (!form || !dailyGoalInput || !input || !status) {
    return;
  }

  const stored = await storageGet([
    STORAGE_KEY_DAILY_GOAL_MINUTES,
    STORAGE_KEY_RETENTION_DAYS
  ]);
  const dailyGoalMinutes = normalizeDailyGoalMinutes(
    stored[STORAGE_KEY_DAILY_GOAL_MINUTES]
  );
  const retentionDays = normalizeRetentionDays(stored[STORAGE_KEY_RETENTION_DAYS]);
  dailyGoalInput.value = String(dailyGoalMinutes);
  input.value = String(retentionDays);

  const nextDefaults = {};
  if (stored[STORAGE_KEY_DAILY_GOAL_MINUTES] === undefined) {
    nextDefaults[STORAGE_KEY_DAILY_GOAL_MINUTES] = dailyGoalMinutes;
  }
  if (stored[STORAGE_KEY_RETENTION_DAYS] === undefined) {
    nextDefaults[STORAGE_KEY_RETENTION_DAYS] = retentionDays;
  }
  if (Object.keys(nextDefaults).length > 0) {
    await storageSet(nextDefaults);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const dailyGoalMinutes = normalizeDailyGoalMinutes(dailyGoalInput.value);
    const retentionDays = normalizeRetentionDays(input.value);
    dailyGoalInput.value = String(dailyGoalMinutes);
    input.value = String(retentionDays);
    status.textContent = "Saving...";

    await storageSet({
      [STORAGE_KEY_DAILY_GOAL_MINUTES]: dailyGoalMinutes,
      [STORAGE_KEY_RETENTION_DAYS]: retentionDays
    });

    status.textContent = "Saved.";
  });
});
