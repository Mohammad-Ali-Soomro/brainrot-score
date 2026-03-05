import React, { useState, useEffect, useCallback } from "react";
import { getWeeklyStats, getWeekKey, getRoast, saveRoast, getStreakData, clearAllData } from "../utils/storage.js";
import { calculateWeeklyScore, buildRoastPrompt } from "../utils/scorer.js";
import { generateRoast, saveAPIKey, getAPIKey } from "../utils/roastGenerator.js";
import { getBrainRotLabel } from "../utils/categorizer.js";

// ─── Styles ──────────────────────────────────────────────────────────────────

const NEON_GREEN = "#39ff14";
const NEON_PURPLE = "#bf5fff";
const BG_DARK = "#0a0a0f";
const BG_CARD = "#151520";
const BG_CARD_HOVER = "#1c1c2e";
const TEXT_PRIMARY = "#e8e8e8";
const TEXT_DIM = "#6b6b80";
const YELLOW = "#ffda44";
const RED = "#ff4444";

const globalStyles = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
  @keyframes glitch {
    0%{transform:translate(0)} 20%{transform:translate(-2px,2px)} 40%{transform:translate(2px,-2px)}
    60%{transform:translate(-1px,-1px)} 80%{transform:translate(1px,1px)} 100%{transform:translate(0)}
  }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes scorePop { 0%{transform:scale(0.6);opacity:0} 60%{transform:scale(1.08)} 100%{transform:scale(1);opacity:1} }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 380px; min-height: 540px; background: ${BG_DARK}; color: ${TEXT_PRIMARY}; font-family: 'Segoe UI', -apple-system, sans-serif; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: ${NEON_PURPLE}44; border-radius: 4px; }
`;

// ─── Helper Components ───────────────────────────────────────────────────────

function ScoreRing({ score, size = 150 }) {
  const color = score < 40 ? NEON_GREEN : score <= 70 ? YELLOW : RED;
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div style={{ position: "relative", width: size, height: size, animation: "scorePop 0.6s ease-out" }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease-out, stroke 0.5s" }}
        />
      </svg>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ fontSize: "36px", fontWeight: 800, color, textShadow: `0 0 20px ${color}66` }}>{score}</span>
        <span style={{ fontSize: "11px", color: TEXT_DIM, marginTop: "-2px" }}>/100</span>
      </div>
    </div>
  );
}

function StatPill({ label, value, color = NEON_PURPLE }) {
  return (
    <div style={{
      background: `${color}15`, border: `1px solid ${color}33`, borderRadius: "12px",
      padding: "10px 14px", flex: 1, textAlign: "center",
    }}>
      <div style={{ fontSize: "11px", color: TEXT_DIM, marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function SiteRow({ hostname, duration, rank }) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px",
      background: BG_CARD, borderRadius: "10px", animation: `fadeIn 0.3s ease ${rank * 0.1}s both`,
    }}>
      <span style={{ fontSize: "14px", color: TEXT_DIM, width: "18px" }}>#{rank}</span>
      <img src={faviconUrl} width="20" height="20" style={{ borderRadius: "4px" }} alt="" />
      <span style={{ flex: 1, fontSize: "13px", color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hostname}</span>
      <span style={{ fontSize: "12px", color: NEON_PURPLE, fontWeight: 600 }}>{formatDuration(duration)}</span>
    </div>
  );
}

function SkeletonBlock({ width = "100%", height = "16px" }) {
  return <div style={{ width, height, background: "#1e1e2e", borderRadius: "8px", animation: "pulse 1.5s infinite" }} />;
}

function Button({ children, onClick, color = NEON_GREEN, disabled = false, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#2a2a3a" : `${color}18`,
        color: disabled ? TEXT_DIM : color,
        border: `1px solid ${disabled ? "#2a2a3a" : color}55`,
        borderRadius: "12px", padding: "12px 20px", fontSize: "14px", fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", width: "100%",
        transition: "all 0.2s", ...style,
      }}
    >{children}</button>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return `<1m`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: THIS WEEK
// ═══════════════════════════════════════════════════════════════════════════════

function ThisWeekTab() {
  const [stats, setStats] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [topBrainRotSites, setTopBrainRotSites] = useState([]);
  const [roast, setRoast] = useState(null);
  const [roastLoading, setRoastLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const weekKey = getWeekKey();
        const weeklyStats = await getWeeklyStats(weekKey);
        const savedRoast = await getRoast(weekKey);

        if (weeklyStats) {
          setStats(weeklyStats);
          const result = calculateWeeklyScore(weeklyStats);
          setScoreData(result);

          // Top 3 brain rot sites
          const sites = Object.entries(weeklyStats.topSites || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
          setTopBrainRotSites(sites);
        } else {
          setScoreData({ finalScore: 0, label: "🧠 You're different fr", breakdown: {} });
        }

        if (savedRoast) setRoast(savedRoast.roastText);
      } catch (err) {
        console.error("Error loading week data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleGenerateRoast = useCallback(async () => {
    if (!stats || !scoreData) return;
    setRoastLoading(true);
    try {
      const prompt = buildRoastPrompt(stats, scoreData.finalScore, stats.topSites);
      const roastText = await generateRoast(prompt);
      setRoast(roastText);
      await saveRoast(getWeekKey(), roastText, scoreData.finalScore);
    } catch (err) {
      console.error("Roast generation failed:", err);
      setRoast("Couldn't generate roast rn. The AI is taking a mental health day fr. Try again later bestie.");
    } finally {
      setRoastLoading(false);
    }
  }, [stats, scoreData]);

  const handleCopyRoast = useCallback(() => {
    if (!roast) return;
    navigator.clipboard.writeText(roast).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roast]);

  if (loading) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
        <SkeletonBlock width="150px" height="150px" />
        <SkeletonBlock width="200px" height="20px" />
        <div style={{ display: "flex", gap: "10px", width: "100%" }}>
          <SkeletonBlock height="60px" />
          <SkeletonBlock height="60px" />
        </div>
      </div>
    );
  }

  const productiveTime = stats ? stats.totalTime - stats.brainRotTime : 0;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", animation: "fadeIn 0.3s ease" }}>
      {/* Score Ring */}
      <ScoreRing score={scoreData?.finalScore || 0} />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "16px", fontWeight: 700 }}>{scoreData?.label || ""}</div>
        <div style={{ fontSize: "11px", color: TEXT_DIM, marginTop: "2px" }}>
          {getBrainRotLabel(Math.round((scoreData?.finalScore || 0) / 10))}
        </div>
      </div>

      {/* Stat Pills */}
      <div style={{ display: "flex", gap: "10px", width: "100%" }}>
        <StatPill label="🧟 Brain Rot" value={formatDuration(stats?.brainRotTime || 0)} color={RED} />
        <StatPill label="🧠 Productive" value={formatDuration(productiveTime)} color={NEON_GREEN} />
      </div>

      {/* Top Sites */}
      {topBrainRotSites.length > 0 && (
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ fontSize: "12px", color: TEXT_DIM, fontWeight: 600, marginBottom: "2px" }}>TOP SITES THIS WEEK</div>
          {topBrainRotSites.map(([hostname, duration], i) => (
            <SiteRow key={hostname} hostname={hostname} duration={duration} rank={i + 1} />
          ))}
        </div>
      )}

      {/* Roast Section */}
      {!roast && !roastLoading && (
        <Button onClick={handleGenerateRoast} color={NEON_PURPLE}>
          Generate My Roast 🔥
        </Button>
      )}

      {roastLoading && (
        <div style={{ width: "100%", background: BG_CARD, borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <SkeletonBlock width="90%" height="14px" />
          <SkeletonBlock width="100%" height="14px" />
          <SkeletonBlock width="75%" height="14px" />
          <SkeletonBlock width="85%" height="14px" />
          <div style={{ fontSize: "11px", color: TEXT_DIM, textAlign: "center", marginTop: "4px" }}>
            AI is cooking your roast... 🍳
          </div>
        </div>
      )}

      {roast && !roastLoading && (
        <div style={{
          width: "100%", background: BG_CARD, borderRadius: "14px", padding: "16px",
          border: `1px solid ${NEON_PURPLE}33`, animation: "fadeIn 0.4s ease",
        }}>
          <div style={{ fontSize: "12px", color: NEON_PURPLE, fontWeight: 700, marginBottom: "8px" }}>YOUR ROAST 🔥</div>
          <p style={{ fontSize: "13px", lineHeight: "1.6", color: TEXT_PRIMARY, whiteSpace: "pre-wrap" }}>{roast}</p>
          <button
            onClick={handleCopyRoast}
            style={{
              marginTop: "12px", background: "none", border: `1px solid ${TEXT_DIM}44`,
              color: copied ? NEON_GREEN : TEXT_DIM, borderRadius: "8px",
              padding: "6px 14px", fontSize: "12px", cursor: "pointer", transition: "all 0.2s",
            }}
          >
            {copied ? "✓ Copied!" : "📋 Copy Roast"}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: STREAKS
// ═══════════════════════════════════════════════════════════════════════════════

function StreaksTab() {
  const [streak, setStreak] = useState(null);
  const [scoreData, setScoreData] = useState(null);
  const [stats, setStats] = useState(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const streakData = await getStreakData();
        setStreak(streakData);

        const weeklyStats = await getWeeklyStats();
        if (weeklyStats) {
          setStats(weeklyStats);
          setScoreData(calculateWeeklyScore(weeklyStats));
        }
      } catch (err) {
        console.error("Error loading streak data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleShare = useCallback(() => {
    if (!scoreData || !stats) return;

    const topSite = Object.entries(stats.topSites || {}).sort((a, b) => b[1] - a[1])[0];
    const topSiteText = topSite ? `Top offender: ${topSite[0]} (${formatDuration(topSite[1])})` : "No top offender detected 🧐";

    const shareText =
      `I scored ${scoreData.finalScore}/100 on BrainRot Score this week ${scoreData.label.split(" ")[0]}\n` +
      `${topSiteText}\n` +
      `brainrotscore.app`;

    navigator.clipboard.writeText(shareText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [scoreData, stats]);

  if (loading) {
    return (
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px", alignItems: "center" }}>
        <SkeletonBlock width="120px" height="80px" />
        <SkeletonBlock width="100%" height="70px" />
      </div>
    );
  }

  const currentScore = scoreData?.finalScore ?? 0;
  const lastScore = streak?.lastWeekScore ?? null;
  const isImproved = lastScore !== null && currentScore <= lastScore;
  const diff = lastScore !== null ? currentScore - lastScore : null;

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "20px", animation: "fadeIn 0.3s ease" }}>
      {/* Streak Counter */}
      <div style={{
        background: BG_CARD, borderRadius: "20px", padding: "28px 40px", textAlign: "center",
        border: `1px solid ${NEON_PURPLE}22`, width: "100%",
      }}>
        <div style={{ fontSize: "48px", lineHeight: 1 }}>
          {"🔥".repeat(Math.min(streak?.currentStreak || 0, 5)) || "💀"}
        </div>
        <div style={{ fontSize: "42px", fontWeight: 800, color: NEON_GREEN, marginTop: "8px" }}>
          {streak?.currentStreak || 0}
        </div>
        <div style={{ fontSize: "13px", color: TEXT_DIM, fontWeight: 600 }}>WEEK STREAK</div>
        <div style={{ fontSize: "11px", color: TEXT_DIM, marginTop: "4px" }}>
          {streak?.currentStreak > 0 ? "Consecutive weeks of improvement" : "Improve your score to start a streak"}
        </div>
      </div>

      {/* Score Comparison */}
      <div style={{
        display: "flex", gap: "12px", width: "100%", alignItems: "center", justifyContent: "center",
        background: BG_CARD, borderRadius: "16px", padding: "18px",
      }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "11px", color: TEXT_DIM, marginBottom: "4px" }}>LAST WEEK</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: lastScore !== null ? TEXT_PRIMARY : TEXT_DIM }}>
            {lastScore !== null ? lastScore : "—"}
          </div>
        </div>

        <div style={{
          fontSize: "24px", color: diff === null ? TEXT_DIM : isImproved ? NEON_GREEN : RED,
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <span>{diff === null ? "•" : isImproved ? "↓" : "↑"}</span>
          {diff !== null && (
            <span style={{ fontSize: "11px", fontWeight: 700 }}>
              {Math.abs(diff)}
            </span>
          )}
        </div>

        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: "11px", color: TEXT_DIM, marginBottom: "4px" }}>THIS WEEK</div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: NEON_PURPLE }}>{currentScore}</div>
        </div>
      </div>

      {/* Best Score */}
      <div style={{
        background: `${NEON_GREEN}10`, border: `1px solid ${NEON_GREEN}22`,
        borderRadius: "12px", padding: "12px 16px", width: "100%", textAlign: "center",
      }}>
        <span style={{ fontSize: "12px", color: TEXT_DIM }}>Personal Best: </span>
        <span style={{ fontSize: "16px", fontWeight: 800, color: NEON_GREEN }}>
          {streak?.bestScore !== null && streak?.bestScore !== undefined ? streak.bestScore : "—"}
        </span>
        <span style={{ fontSize: "12px", color: TEXT_DIM }}>/100</span>
      </div>

      {/* Share Button */}
      <Button onClick={handleShare} color={NEON_PURPLE} disabled={!scoreData}>
        {copied ? "✓ Copied to Clipboard!" : "Share My Score 📤"}
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

function SettingsTab() {
  const [apiKey, setApiKey] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(true);

  useEffect(() => {
    (async () => {
      const key = await getAPIKey();
      if (key) {
        setHasKey(true);
        setApiKey(key);
      }
      // Load notification preference
      const { weekly_notifications } = await chrome.storage.local.get("weekly_notifications");
      setNotificationsOn(weekly_notifications !== false); // default true
    })();
  }, []);

  const handleSaveKey = useCallback(async () => {
    if (!apiKey.trim()) return;
    await saveAPIKey(apiKey.trim());
    setKeySaved(true);
    setHasKey(true);
    setTimeout(() => setKeySaved(false), 2000);
  }, [apiKey]);

  const handleClearData = useCallback(async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000); // auto-reset confirm
      return;
    }
    await clearAllData();
    setCleared(true);
    setConfirmClear(false);
    setTimeout(() => setCleared(false), 2500);
  }, [confirmClear]);

  const handleToggleNotifications = useCallback(async () => {
    const newValue = !notificationsOn;
    setNotificationsOn(newValue);
    await chrome.storage.local.set({ weekly_notifications: newValue });

    if (newValue) {
      // Re-enable alarm
      const existing = await chrome.alarms.get("weekly_roast");
      if (!existing) {
        chrome.alarms.create("weekly_roast", { periodInMinutes: 10080, delayInMinutes: 10080 });
      }
    } else {
      // Disable alarm
      await chrome.alarms.clear("weekly_roast");
    }
  }, [notificationsOn]);

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "20px", animation: "fadeIn 0.3s ease" }}>
      {/* API Key */}
      <div style={{ background: BG_CARD, borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT_PRIMARY, marginBottom: "12px" }}>🔑 OpenRouter API Key</div>
        <input
          type="password"
          placeholder={hasKey ? "••••••••••••••••••••••" : "sk-or-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", background: "#0d0d15", border: `1px solid ${NEON_PURPLE}33`,
            borderRadius: "10px", color: TEXT_PRIMARY, fontSize: "13px", outline: "none",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleSaveKey}
          style={{
            marginTop: "10px", width: "100%", padding: "10px",
            background: keySaved ? `${NEON_GREEN}22` : `${NEON_PURPLE}18`,
            color: keySaved ? NEON_GREEN : NEON_PURPLE,
            border: `1px solid ${keySaved ? NEON_GREEN : NEON_PURPLE}44`,
            borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {keySaved ? "✓ Saved!" : "Save Key"}
        </button>
        <div style={{ fontSize: "11px", color: TEXT_DIM, marginTop: "8px" }}>
          Stored locally in your browser. Never sent anywhere except OpenRouter's API.
        </div>
      </div>

      {/* Notifications Toggle */}
      <div style={{
        background: BG_CARD, borderRadius: "16px", padding: "18px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT_PRIMARY }}>🔔 Weekly Roast Notifications</div>
          <div style={{ fontSize: "11px", color: TEXT_DIM, marginTop: "2px" }}>Get roasted every Sunday at 9am</div>
        </div>
        <button
          onClick={handleToggleNotifications}
          style={{
            width: "50px", height: "28px", borderRadius: "14px", border: "none",
            background: notificationsOn ? NEON_GREEN : "#2a2a3a",
            position: "relative", cursor: "pointer", transition: "background 0.3s", flexShrink: 0,
          }}
        >
          <div style={{
            width: "22px", height: "22px", borderRadius: "50%", background: "white",
            position: "absolute", top: "3px",
            left: notificationsOn ? "25px" : "3px",
            transition: "left 0.3s",
          }} />
        </button>
      </div>

      {/* Clear Data */}
      <div style={{ background: BG_CARD, borderRadius: "16px", padding: "18px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT_PRIMARY, marginBottom: "8px" }}>🗑️ Clear All Data</div>
        <div style={{ fontSize: "11px", color: TEXT_DIM, marginBottom: "12px" }}>
          Removes all visit logs, weekly stats, and roasts. Your streak is preserved.
        </div>
        <button
          onClick={handleClearData}
          style={{
            width: "100%", padding: "10px",
            background: cleared ? `${NEON_GREEN}22` : confirmClear ? `${RED}22` : `${RED}10`,
            color: cleared ? NEON_GREEN : RED,
            border: `1px solid ${cleared ? NEON_GREEN : RED}44`,
            borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer",
            transition: "all 0.2s",
          }}
        >
          {cleared ? "✓ Data Cleared" : confirmClear ? "Tap again to confirm" : "Clear All Data"}
        </button>
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", paddingBottom: "8px" }}>
        <div style={{ fontSize: "11px", color: TEXT_DIM }}>BrainRot Score v1.0</div>
        <div style={{ fontSize: "10px", color: `${TEXT_DIM}88`, marginTop: "2px" }}>Your data never leaves your browser 🔒</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id: "week", label: "This Week", icon: "📊" },
  { id: "streaks", label: "Streaks", icon: "🔥" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function App() {
  const [activeTab, setActiveTab] = useState("week");

  return (
    <>
      <style>{globalStyles}</style>
      <div style={{
        width: "380px", minHeight: "540px", background: BG_DARK, color: TEXT_PRIMARY,
        display: "flex", flexDirection: "column", position: "relative",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 16px 10px", textAlign: "center",
          borderBottom: `1px solid ${NEON_PURPLE}15`,
          background: `linear-gradient(180deg, ${NEON_PURPLE}08 0%, transparent 100%)`,
        }}>
          <h1 style={{
            fontSize: "18px", fontWeight: 800, margin: 0,
            background: `linear-gradient(135deg, ${NEON_GREEN}, ${NEON_PURPLE})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "glitch 3s infinite",
          }}>
            🧠 BrainRot Score
          </h1>
          <p style={{ fontSize: "10px", color: TEXT_DIM, marginTop: "2px", letterSpacing: "1px" }}>
            YOUR WEEKLY DOOM REPORT
          </p>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", paddingBottom: "60px" }}>
          {activeTab === "week" && <ThisWeekTab />}
          {activeTab === "streaks" && <StreaksTab />}
          {activeTab === "settings" && <SettingsTab />}
        </div>

        {/* Bottom Tab Bar */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          display: "flex", background: "#0d0d14", borderTop: `1px solid ${NEON_PURPLE}15`,
          padding: "6px 0 8px",
        }}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, background: "none", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: "2px",
                  padding: "4px 0", transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: "18px", filter: isActive ? "none" : "grayscale(1) opacity(0.5)" }}>
                  {tab.icon}
                </span>
                <span style={{
                  fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px",
                  color: isActive ? NEON_GREEN : TEXT_DIM,
                  transition: "color 0.2s",
                }}>
                  {tab.label}
                </span>
                {isActive && (
                  <div style={{
                    width: "20px", height: "2px", borderRadius: "1px",
                    background: NEON_GREEN, marginTop: "2px",
                    boxShadow: `0 0 8px ${NEON_GREEN}`,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default App;
