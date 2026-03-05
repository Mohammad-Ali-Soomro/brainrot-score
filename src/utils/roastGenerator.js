// roastGenerator.js — Call Anthropic Claude API to generate the weekly roast

// ─── Fallback Roasts ─────────────────────────────────────────────────────────

const FALLBACK_ROASTS = [
  "Bestie, your screen time this week was genuinely unhinged. You spent more time doom-scrolling than some people spend at their actual jobs, no cap. The way you're speedrunning brain rot is lowkey impressive fr fr. Your WiFi router is begging for a day off. But real talk — the fact that you're even checking this means you care about doing better, and that's kinda wholesome ngl. 🧠",
  "The internet was a mistake and you are exhibit A this week, no cap. You out here treating TikTok like it's a full-time career — absolute menace behavior fr. Your screen time report just dropped and it's giving unemployment arc. Even your browser history is judging you rn. But hey, tomorrow's a new day and you've got main character energy when you actually try. 💪",
  "Oh you are COOKED cooked this week bestie. Like actually genuinely fried. Your browsing history reads like a cry for help written entirely in memes fr fr. The algorithm ate you up and left no crumbs. But lowkey the fact you're self-aware enough to check your score means you're already better than 90% of the chronically online population, and that's kinda beautiful ngl.",
];

// ─── API Key Management ──────────────────────────────────────────────────────

/**
 * Save the Anthropic API key to chrome.storage.local.
 * @param {string} key — the API key
 */
export async function saveAPIKey(key) {
  await chrome.storage.local.set({ anthropic_api_key: key });
}

/**
 * Retrieve the stored Anthropic API key.
 * @returns {Promise<string|null>}
 */
export async function getAPIKey() {
  const { anthropic_api_key } = await chrome.storage.local.get("anthropic_api_key");
  return anthropic_api_key || null;
}

// ─── Roast Generation ────────────────────────────────────────────────────────

/**
 * Call the Anthropic Claude API to generate a personalised roast.
 *
 * @param {string} prompt — the full prompt string (from buildRoastPrompt)
 * @returns {Promise<string>} — the roast text
 */
export async function generateRoast(prompt) {
  const apiKey = await getAPIKey();

  if (!apiKey) {
    console.warn("BrainRot: No API key set — returning fallback roast");
    return getRandomFallback();
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`BrainRot: Claude API error ${response.status}:`, errorBody);
      return getRandomFallback();
    }

    const data = await response.json();

    // Extract text from the response
    if (data.content && data.content.length > 0 && data.content[0].text) {
      return data.content[0].text.trim();
    }

    console.warn("BrainRot: Unexpected API response shape", data);
    return getRandomFallback();
  } catch (err) {
    console.error("BrainRot: Failed to call Claude API", err);
    return getRandomFallback();
  }
}

// ─── Internal ────────────────────────────────────────────────────────────────

function getRandomFallback() {
  return FALLBACK_ROASTS[Math.floor(Math.random() * FALLBACK_ROASTS.length)];
}
