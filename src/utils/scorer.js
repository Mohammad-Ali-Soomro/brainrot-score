// scorer.js — Calculate the weekly Brain Rot Score and build the AI roast prompt

import { categorizeURL } from "./categorizer.js";

// ─── Score Labels ────────────────────────────────────────────────────────────

const SCORE_LABELS = [
  { max: 20, label: "🧠 You're different fr" },
  { max: 40, label: "😌 Relatively sane" },
  { max: 60, label: "📱 Average chronically online person" },
  { max: 80, label: "🫠 Genuinely cooked" },
  { max: 100, label: "🧟 No thoughts, head empty" },
];

/**
 * Get the label for a given final score (0-100).
 * @param {number} score
 * @returns {string}
 */
export function getScoreLabel(score) {
  for (const tier of SCORE_LABELS) {
    if (score <= tier.max) return tier.label;
  }
  return SCORE_LABELS[SCORE_LABELS.length - 1].label;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format seconds into a human string like "3h 24m".
 */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Get the day-of-week name from a "YYYY-MM-DD" key.
 */
function dayName(dateKey) {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const d = new Date(dateKey + "T12:00:00"); // noon to avoid timezone edge cases
  return days[d.getDay()];
}

// ─── 1. calculateWeeklyScore ─────────────────────────────────────────────────

/**
 * Calculate a final weekly Brain Rot Score from 0–100.
 *
 * Factors:
 *   1. Brain Rot Ratio (60% weight) — brainRotTime / totalTime → scaled to 0-100
 *   2. Volume penalty (20% weight)  — raw hours of brain rot (caps at 30h / week)
 *   3. Consistency penalty (20% weight) — spikes on single days are penalized
 *
 * @param {{ totalTime: number, brainRotTime: number, topSites: Object, dailyScores: Object }} weeklyStats
 * @returns {{ finalScore: number, label: string, breakdown: Object }}
 */
export function calculateWeeklyScore(weeklyStats) {
  if (!weeklyStats || weeklyStats.totalTime === 0) {
    return {
      finalScore: 0,
      label: getScoreLabel(0),
      breakdown: {
        ratioScore: 0,
        volumeScore: 0,
        consistencyPenalty: 0,
        brainRotRatio: 0,
      },
    };
  }

  const { totalTime, brainRotTime, dailyScores } = weeklyStats;

  // ── Factor 1: Brain Rot Ratio (60% weight) ─────────────────────────────
  const brainRotRatio = brainRotTime / totalTime;
  const ratioScore = Math.min(brainRotRatio * 100, 100);

  // ── Factor 2: Volume penalty (20% weight) ──────────────────────────────
  // Cap at 30 hours of brain rot per week → 100%
  const brainRotHours = brainRotTime / 3600;
  const volumeScore = Math.min((brainRotHours / 30) * 100, 100);

  // ── Factor 3: Consistency penalty (20% weight) ─────────────────────────
  // If brain rot is concentrated on fewer days, it means binge sessions → worse
  let consistencyPenalty = 0;
  if (dailyScores && Object.keys(dailyScores).length > 0) {
    const dayEntries = Object.values(dailyScores);
    const dayAverages = dayEntries.map((d) => (d.count > 0 ? d.totalScore / d.count : 0));
    const maxDayAvg = Math.max(...dayAverages);
    const avgDayAvg = dayAverages.reduce((a, b) => a + b, 0) / dayAverages.length;

    // If max day is significantly above average → spike penalty
    if (avgDayAvg > 0) {
      const spikeRatio = maxDayAvg / avgDayAvg;
      consistencyPenalty = Math.min((spikeRatio - 1) * 30, 100); // cap at 100
      consistencyPenalty = Math.max(consistencyPenalty, 0);
    }
  }

  // ── Weighted final score ────────────────────────────────────────────────
  const rawScore = ratioScore * 0.6 + volumeScore * 0.2 + consistencyPenalty * 0.2;
  const finalScore = Math.round(Math.min(Math.max(rawScore, 0), 100));

  return {
    finalScore,
    label: getScoreLabel(finalScore),
    breakdown: {
      ratioScore: Math.round(ratioScore),
      volumeScore: Math.round(volumeScore),
      consistencyPenalty: Math.round(consistencyPenalty),
      brainRotRatio: Math.round(brainRotRatio * 100) / 100,
    },
  };
}

// ─── 2. buildRoastPrompt ─────────────────────────────────────────────────────

/**
 * Build a prompt string to send to Claude API for generating the weekly roast.
 *
 * @param {{ totalTime: number, brainRotTime: number, topSites: Object, dailyScores: Object }} weeklyStats
 * @param {number} finalScore — 0-100
 * @param {Object} topSites  — { hostname: seconds_spent }
 * @returns {string} — the prompt to send to Claude
 */
export function buildRoastPrompt(weeklyStats, finalScore, topSites) {
  const label = getScoreLabel(finalScore);
  const brainRotHours = formatDuration(weeklyStats.brainRotTime);
  const totalHours = formatDuration(weeklyStats.totalTime);

  // ── Top 3 brain rot sites (by time) ─────────────────────────────────────
  const siteEntries = Object.entries(topSites || {});
  const brainRotSites = siteEntries
    .filter(([hostname]) => {
      const result = categorizeURL(`https://${hostname}`, "");
      return result.isBrainRot;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hostname, seconds]) => `${hostname} (${formatDuration(seconds)})`);

  // ── Worst day (highest avg brain rot score) ─────────────────────────────
  let worstDay = "unknown";
  if (weeklyStats.dailyScores) {
    let maxAvg = -1;
    for (const [dateKey, data] of Object.entries(weeklyStats.dailyScores)) {
      const avg = data.count > 0 ? data.totalScore / data.count : 0;
      if (avg > maxAvg) {
        maxAvg = avg;
        worstDay = dayName(dateKey);
      }
    }
  }

  // ── Build the prompt ────────────────────────────────────────────────────
  const prompt = `You are a Gen Z internet culture expert who roasts people's internet habits. You're savage but funny.

Here are the user's browsing stats for this week:
- Total screen time: ${totalHours}
- Time on brain rot sites: ${brainRotHours}
- Brain Rot Score: ${finalScore}/100 (${label})
- Top brain rot sites: ${brainRotSites.length > 0 ? brainRotSites.join(", ") : "none detected (suspicious...)"}
- Worst day: ${worstDay}

Write a 4–6 sentence brutally funny, Gen Z-coded roast of this user's week. Be absolutely savage but end with one surprisingly wholesome sentence.

Rules:
- Use brainrot slang naturally (e.g. "no cap", "fr fr", "cooked", "ate", "understood the assignment", "slay", "its giving", "down bad", "main character energy")
- Do NOT use hashtags
- Keep it conversational, like you're roasting a friend in a group chat
- Max 150 words
- Reference their specific sites and habits — make it personal
- If their score is low (actually productive), be suspiciously impressed but still find something to roast`;

  return prompt;
}
