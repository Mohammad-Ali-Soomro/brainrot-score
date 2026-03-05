// BrainRot Score — Background Service Worker
// Handles tab tracking, alarms, and data orchestration

import { logVisit, getWeekKey } from "../utils/storage.js";

console.log("🧠 BrainRot Score service worker loaded");

// ─── State ───────────────────────────────────────────────────────────────────

/** @type {Map<number, { url: string, title: string, startTime: number }>} */
const activeTabSessions = new Map();

/** Track the previously-active tab so we can end its session on switch */
let previousTabId = null;

/** Whether the browser window is currently focused */
let windowFocused = true;

// ─── URL Filtering ───────────────────────────────────────────────────────────

const IGNORED_URL_PREFIXES = ["chrome://", "edge://", "about:", "chrome-extension://", "devtools://"];

function shouldIgnoreURL(url) {
  if (!url) return true;
  if (IGNORED_URL_PREFIXES.some((prefix) => url.startsWith(prefix))) return true;
  try {
    const hostname = new URL(url).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  } catch {
    return true;
  }
  return false;
}

// ─── Session Management ──────────────────────────────────────────────────────

/**
 * Start tracking a new session for a tab.
 */
function startSession(tabId, url, title) {
  if (shouldIgnoreURL(url)) return;
  activeTabSessions.set(tabId, {
    url,
    title: title || "",
    startTime: Date.now(),
  });
}

/**
 * End the session for a tab, compute duration, and log the visit.
 * Only logs visits longer than 5 seconds.
 */
async function endSession(tabId) {
  const session = activeTabSessions.get(tabId);
  if (!session) return;

  activeTabSessions.delete(tabId);

  const durationSeconds = (Date.now() - session.startTime) / 1000;
  if (durationSeconds <= 5) return; // ignore accidental clicks
  if (shouldIgnoreURL(session.url)) return;

  try {
    await logVisit(session.url, session.title, Math.round(durationSeconds));
  } catch (err) {
    console.error("BrainRot: failed to log visit", err);
  }
}

/**
 * Pause all active sessions (e.g. when browser loses focus).
 * Ends them so time isn't counted while the user is away.
 */
async function pauseAllSessions() {
  const tabIds = [...activeTabSessions.keys()];
  for (const tabId of tabIds) {
    await endSession(tabId);
  }
}

/**
 * Resume tracking for the currently active tab after window regains focus.
 */
async function resumeActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null) {
      startSession(tab.id, tab.url, tab.title);
      previousTabId = tab.id;
    }
  } catch {
    // no active tab — that's fine
  }
}

// ─── Tab Event Listeners ─────────────────────────────────────────────────────

/**
 * Fired when the user switches to a different tab.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // End previous tab's session
  if (previousTabId !== null && previousTabId !== activeInfo.tabId) {
    await endSession(previousTabId);
  }

  // Start new session for the newly active tab
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    startSession(tab.id, tab.url, tab.title);
    previousTabId = tab.id;
  } catch {
    // tab may have been closed between events
  }
});

/**
 * Fired when a tab finishes loading a new page.
 * If it's the active tab, restart the session with the new URL.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!tab.active) return;

  // End the old session for this tab (old URL)
  await endSession(tabId);

  // Start a fresh session with the new URL
  startSession(tabId, tab.url, tab.title);
  previousTabId = tabId;
});

/**
 * Fired when a tab is closed — end its session.
 */
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await endSession(tabId);
  if (previousTabId === tabId) {
    previousTabId = null;
  }
});

// ─── Window Focus ────────────────────────────────────────────────────────────

/**
 * Pause tracking when the browser loses focus, resume when it regains focus.
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Browser lost focus — pause all sessions
    windowFocused = false;
    await pauseAllSessions();
  } else if (!windowFocused) {
    // Browser regained focus — resume the active tab
    windowFocused = true;
    await resumeActiveTab();
  }
});

// ─── Weekly Roast Alarm ──────────────────────────────────────────────────────

/**
 * Calculate milliseconds until next Sunday at 9:00 AM local time.
 */
function msUntilNextSunday9AM() {
  const now = new Date();
  const target = new Date(now);

  // Set to next Sunday
  const daysUntilSunday = (7 - now.getDay()) % 7 || 7; // if today is Sunday, go to next Sunday
  target.setDate(now.getDate() + daysUntilSunday);
  target.setHours(9, 0, 0, 0);

  // If we're already past Sunday 9am this week (shouldn't happen with above logic, but safety)
  if (target <= now) {
    target.setDate(target.getDate() + 7);
  }

  return target.getTime() - now.getTime();
}

/**
 * Set up the weekly roast alarm — fires every Sunday at 9 AM.
 */
async function setupWeeklyAlarm() {
  // Clear any existing alarm first
  await chrome.alarms.clear("weekly_roast");

  const delayMinutes = msUntilNextSunday9AM() / (1000 * 60);

  chrome.alarms.create("weekly_roast", {
    delayInMinutes: delayMinutes,
    periodInMinutes: 10080, // 7 days
  });

  console.log(`🧠 Weekly roast alarm set — first fire in ${Math.round(delayMinutes / 60)} hours`);
}

// ─── Alarm Handler ───────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "weekly_roast") {
    chrome.notifications.create("weekly_roast_notification", {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: "Your Weekly Doom Report is ready 🧟",
      message: "Tap to see how cooked you are this week",
      priority: 2,
    });
  }
});

// ─── Notification Click Handler ──────────────────────────────────────────────

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === "weekly_roast_notification") {
    // Open the extension popup (can't directly open popup, so open a tab or focus the popup)
    chrome.action.openPopup?.() || chrome.tabs.create({ url: chrome.runtime.getURL("src/popup/popup.html") });
  }
});

// ─── Extension Install / Startup ─────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log("🧠 BrainRot Score installed:", details.reason);
  await setupWeeklyAlarm();

  // Start tracking the currently active tab immediately
  await resumeActiveTab();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log("🧠 BrainRot Score startup");
  await setupWeeklyAlarm();
  await resumeActiveTab();
});
