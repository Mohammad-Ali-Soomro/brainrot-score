// storage.js — Wrapper around chrome.storage.local for browsing data

import { categorizeURL } from "./categorizer.js";

// ─── Helper: ISO Week Key ────────────────────────────────────────────────────

/**
 * Returns a week key string "YYYY_WW" for the given date (or now).
 * Uses ISO week numbering (Monday = start of week).
 *
 * @param {Date} [date=new Date()]
 * @returns {string} e.g. "2026_10"
 */
export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday (ISO weeks start Monday, Thursday determines week year)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  const paddedWeek = String(weekNo).padStart(2, "0");
  return `${d.getUTCFullYear()}_${paddedWeek}`;
}

/**
 * Return today's date as "YYYY-MM-DD".
 */
function getTodayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ─── Internal chrome.storage.local helpers ───────────────────────────────────

async function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

async function storageSet(items) {
  return chrome.storage.local.set(items);
}

async function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

/**
 * Get all keys currently in chrome.storage.local.
 * @returns {Promise<string[]>}
 */
async function getAllKeys() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all);
}

// ─── 1. logVisit ─────────────────────────────────────────────────────────────

/**
 * Log a page visit — categorises the URL, appends to the week's visit log,
 * and updates running weekly statistics.
 *
 * @param {string} url              — full page URL
 * @param {string} title            — document.title
 * @param {number} duration_seconds — seconds spent on the page
 */
export async function logVisit(url, title, duration_seconds) {
  const { category, isBrainRot, score } = categorizeURL(url, title);
  const weekKey = getWeekKey();
  const visitsKey = `visits_${weekKey}`;
  const statsKey = `weekly_stats_${weekKey}`;

  const visit = {
    url,
    title,
    category,
    isBrainRot,
    score,
    duration_seconds,
    timestamp: Date.now(),
  };

  // ── Append visit ────────────────────────────────────────────────────────
  const { [visitsKey]: existingVisits = [] } = await storageGet(visitsKey);
  existingVisits.push(visit);
  await storageSet({ [visitsKey]: existingVisits });

  // ── Update weekly stats ─────────────────────────────────────────────────
  const { [statsKey]: stats = { totalTime: 0, brainRotTime: 0, topSites: {}, dailyScores: {} } } =
    await storageGet(statsKey);

  stats.totalTime += duration_seconds;
  if (isBrainRot) {
    stats.brainRotTime += duration_seconds;
  }

  // Track top sites by total duration
  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    hostname = url;
  }
  stats.topSites[hostname] = (stats.topSites[hostname] || 0) + duration_seconds;

  // Track daily average score
  const todayKey = getTodayKey();
  if (!stats.dailyScores[todayKey]) {
    stats.dailyScores[todayKey] = { totalScore: 0, count: 0 };
  }
  stats.dailyScores[todayKey].totalScore += score;
  stats.dailyScores[todayKey].count += 1;

  await storageSet({ [statsKey]: stats });
}

// ─── 2. getWeeklyStats ──────────────────────────────────────────────────────

/**
 * Retrieve the running weekly statistics for a given week (or the current week).
 *
 * @param {string} [weekKey] — "YYYY_WW" (defaults to current week)
 * @returns {Promise<{ totalTime: number, brainRotTime: number, topSites: Object, dailyScores: Object } | null>}
 */
export async function getWeeklyStats(weekKey) {
  const key = `weekly_stats_${weekKey || getWeekKey()}`;
  const result = await storageGet(key);
  return result[key] || null;
}

// ─── 3. getVisitsForWeek ─────────────────────────────────────────────────────

/**
 * Return the raw visits array for a given week.
 *
 * @param {string} [weekKey]
 * @returns {Promise<Array>}
 */
export async function getVisitsForWeek(weekKey) {
  const key = `visits_${weekKey || getWeekKey()}`;
  const result = await storageGet(key);
  return result[key] || [];
}

// ─── 4. saveRoast ────────────────────────────────────────────────────────────

/**
 * Persist the AI-generated roast and final score for a given week.
 *
 * @param {string} weekKey   — "YYYY_WW"
 * @param {string} roastText — The generated roast
 * @param {number} finalScore — 0-10
 */
export async function saveRoast(weekKey, roastText, finalScore) {
  const key = `roast_${weekKey}`;
  await storageSet({
    [key]: {
      roastText,
      finalScore,
      generatedAt: Date.now(),
    },
  });
}

// ─── 5. getRoast ─────────────────────────────────────────────────────────────

/**
 * Retrieve a saved roast for the specified week (or current week).
 *
 * @param {string} [weekKey]
 * @returns {Promise<{ roastText: string, finalScore: number, generatedAt: number } | null>}
 */
export async function getRoast(weekKey) {
  const key = `roast_${weekKey || getWeekKey()}`;
  const result = await storageGet(key);
  return result[key] || null;
}

// ─── 6. getStreakData ────────────────────────────────────────────────────────

/**
 * Return streak tracking data.
 *
 * @returns {Promise<{ currentStreak: number, lastWeekScore: number | null, bestScore: number | null }>}
 */
export async function getStreakData() {
  const { streak_data: data } = await storageGet("streak_data");
  return data || { currentStreak: 0, lastWeekScore: null, bestScore: null };
}

// ─── 7. updateStreak ─────────────────────────────────────────────────────────

/**
 * Update the streak after a week ends.
 *   - "Better" means a LOWER score (less brain rot).
 *   - If the new score is lower than (or equal to) last week → streak increments.
 *   - If worse (higher score) → streak resets to 0.
 *   - Best score tracks the lowest score ever achieved.
 *
 * @param {number} weekScore — the final brain-rot score for the week (0-10)
 */
export async function updateStreak(weekScore) {
  const streak = await getStreakData();

  if (streak.lastWeekScore === null) {
    // First ever week — start the streak
    streak.currentStreak = 1;
  } else if (weekScore <= streak.lastWeekScore) {
    // Improved or maintained — streak grows
    streak.currentStreak += 1;
  } else {
    // Got worse — streak resets
    streak.currentStreak = 0;
  }

  streak.lastWeekScore = weekScore;

  if (streak.bestScore === null || weekScore < streak.bestScore) {
    streak.bestScore = weekScore;
  }

  await storageSet({ streak_data: streak });
}

// ─── 8. clearAllData ─────────────────────────────────────────────────────────

/**
 * Remove all visit logs, weekly stats, and roasts from storage.
 * Preserves streak_data so the user doesn't lose their streak.
 */
export async function clearAllData() {
  const keys = await getAllKeys();
  const toRemove = keys.filter(
    (k) => k.startsWith("visits_") || k.startsWith("weekly_stats_") || k.startsWith("roast_")
  );
  if (toRemove.length > 0) {
    await storageRemove(toRemove);
  }
}
