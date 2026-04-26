// options.js - YouTube Tracker

import { normalizeRetentionDays } from "./utils.js";

const STORAGE_KEY_RETENTION_DAYS = "retentionDays";

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("retention-form");
  const input = document.getElementById("retention-days");
  const status = document.getElementById("save-status");

  if (!form || !input || !status) {
    return;
  }

  const stored = await storageGet([STORAGE_KEY_RETENTION_DAYS]);
  const retentionDays = normalizeRetentionDays(stored[STORAGE_KEY_RETENTION_DAYS]);
  input.value = String(retentionDays);

  if (stored[STORAGE_KEY_RETENTION_DAYS] === undefined) {
    await storageSet({ [STORAGE_KEY_RETENTION_DAYS]: retentionDays });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const retentionDays = normalizeRetentionDays(input.value);
    input.value = String(retentionDays);
    status.textContent = "Saving...";

    await storageSet({ [STORAGE_KEY_RETENTION_DAYS]: retentionDays });

    status.textContent = "Saved.";
  });
});
