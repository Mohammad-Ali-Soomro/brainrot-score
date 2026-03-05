// categorizer.js — Classify URLs/domains as productive vs brain rot

// ─── Domain → Category Mappings ──────────────────────────────────────────────

const SOCIAL_MEDIA_DOMAINS = [
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "snapchat.com",
  "threads.net",
  "facebook.com",
];

const GAMING_DOMAINS = [
  "twitch.tv",
  "store.steampowered.com",
  "steampowered.com",
  "steam.com",
  "roblox.com",
  "epicgames.com",
];

const MEME_DOMAINS = ["9gag.com", "ifunny.com", "memedroid.com"];

const NEWS_DOOM_DOMAINS = [
  "dailymail.co.uk",
  "buzzfeed.com",
  "tmz.com",
  "pagesix.com",
  "eonline.com",
  "perezhilton.com",
];

const PRODUCTIVE_DOMAINS = [
  "github.com",
  "stackoverflow.com",
  "stackexchange.com",
  "coursera.org",
  "udemy.com",
  "leetcode.com",
  "notion.so",
  "notion.site",
  "developer.mozilla.org",
  "w3schools.com",
  "freecodecamp.org",
  "kaggle.com",
  "hackerrank.com",
  "edx.org",
  "khanacademy.org",
];

const WORK_STUDY_DOMAINS = [
  "docs.google.com",
  "sheets.google.com",
  "slides.google.com",
  "figma.com",
  "linear.app",
  "jira.atlassian.com",
  "zoom.us",
  "meet.google.com",
  "slack.com",
  "trello.com",
  "asana.com",
  "clickup.com",
];

const PRODUCTIVE_REDDIT_SUBS = [
  "r/programming",
  "r/webdev",
  "r/learnprogramming",
  "r/compsci",
  "r/javascript",
  "r/reactjs",
  "r/python",
  "r/machinelearning",
  "r/cscareerquestions",
  "r/coding",
  "r/devops",
  "r/typescript",
];

const YOUTUBE_LEARNING_KEYWORDS = [
  "tutorial",
  "course",
  "lecture",
  "lesson",
  "how to code",
  "explained",
  "crash course",
  "full course",
  "programming",
  "for beginners",
  "deep dive",
  "walkthrough",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract hostname from a URL string, stripping "www." prefix.
 */
function getHostname(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname;
  } catch {
    return "";
  }
}

/**
 * Check if a hostname matches any domain in a list.
 * Supports exact match and subdomain match (e.g. "m.twitter.com" matches "twitter.com").
 */
function matchesDomain(hostname, domains) {
  return domains.some(
    (d) => hostname === d || hostname.endsWith("." + d)
  );
}

// ─── Main Categorizer ────────────────────────────────────────────────────────

/**
 * Categorize a visited URL + page title into a brain-rot category.
 *
 * @param {string} url   — full URL of the page
 * @param {string} title — document title (used for YouTube learning detection)
 * @returns {{ category: string, isBrainRot: boolean, score: number }}
 */
export function categorizeURL(url, title = "") {
  const hostname = getHostname(url);
  if (!hostname) return { category: "neutral", isBrainRot: false, score: 3 };

  let pathname = "";
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    // ignore
  }
  const lowerTitle = title.toLowerCase();

  // ── YouTube (special handling) ──────────────────────────────────────────
  if (hostname === "youtube.com" || hostname === "m.youtube.com") {
    // Shorts → pure brain rot
    if (pathname.includes("/shorts/") || pathname.startsWith("/shorts")) {
      return { category: "short_video", isBrainRot: true, score: 10 };
    }
    // Learning content detected via title keywords
    const isLearning = YOUTUBE_LEARNING_KEYWORDS.some((kw) =>
      lowerTitle.includes(kw)
    );
    if (isLearning) {
      return { category: "youtube_learning", isBrainRot: false, score: 2 };
    }
    // Generic YouTube — mild rot
    return { category: "social_media", isBrainRot: true, score: 8 };
  }

  // ── TikTok → always short-form brain rot ────────────────────────────────
  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
    return { category: "short_video", isBrainRot: true, score: 10 };
  }

  // ── Instagram Reels detection ───────────────────────────────────────────
  if (
    (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) &&
    pathname.includes("/reels")
  ) {
    return { category: "short_video", isBrainRot: true, score: 10 };
  }

  // ── Reddit (special handling) ───────────────────────────────────────────
  if (hostname === "reddit.com" || hostname.endsWith(".reddit.com")) {
    const isProductiveSub = PRODUCTIVE_REDDIT_SUBS.some((sub) =>
      pathname.toLowerCase().includes(sub.toLowerCase())
    );
    if (isProductiveSub) {
      return { category: "productive", isBrainRot: false, score: 0 };
    }
    return { category: "memes", isBrainRot: true, score: 9 };
  }

  // ── Social Media ────────────────────────────────────────────────────────
  if (matchesDomain(hostname, SOCIAL_MEDIA_DOMAINS)) {
    return { category: "social_media", isBrainRot: true, score: 8 };
  }

  // ── Gaming ──────────────────────────────────────────────────────────────
  if (matchesDomain(hostname, GAMING_DOMAINS)) {
    return { category: "gaming", isBrainRot: true, score: 7 };
  }

  // ── Memes ───────────────────────────────────────────────────────────────
  if (matchesDomain(hostname, MEME_DOMAINS)) {
    return { category: "memes", isBrainRot: true, score: 9 };
  }

  // ── News / Doom Scrolling ───────────────────────────────────────────────
  if (matchesDomain(hostname, NEWS_DOOM_DOMAINS)) {
    return { category: "news_doom", isBrainRot: true, score: 7 };
  }

  // ── Productive ──────────────────────────────────────────────────────────
  if (matchesDomain(hostname, PRODUCTIVE_DOMAINS)) {
    return { category: "productive", isBrainRot: false, score: 0 };
  }

  // ── docs.* subdomains (e.g. docs.python.org) ───────────────────────────
  if (hostname.startsWith("docs.") || hostname.startsWith("developer.")) {
    return { category: "productive", isBrainRot: false, score: 0 };
  }

  // ── Work / Study tools ─────────────────────────────────────────────────
  if (matchesDomain(hostname, WORK_STUDY_DOMAINS)) {
    return { category: "work_study", isBrainRot: false, score: 0 };
  }

  // ── Everything else → neutral ──────────────────────────────────────────
  return { category: "neutral", isBrainRot: false, score: 3 };
}

// ─── Brain Rot Label ─────────────────────────────────────────────────────────

/**
 * Return an emoji + label for a given brain rot score (0-10).
 *
 * @param {number} score — 0 (productive) to 10 (full rot)
 * @returns {string}
 */
export function getBrainRotLabel(score) {
  if (score <= 2) return "🧠 Galaxy Brain";
  if (score <= 4) return "😐 Mid";
  if (score <= 6) return "📱 Chronically Online";
  if (score <= 8) return "🫠 Cooked";
  return "🧟 Full Brainrot";
}
