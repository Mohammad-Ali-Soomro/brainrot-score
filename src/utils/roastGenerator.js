// roastGenerator.js — Call Grok 3 Mini via OpenRouter API to generate the weekly roast

const FALLBACK_ROAST =
  "bro spent 40 hours on tiktok and has the audacity to open a coding extension fr fr 🧟 no thoughts, head empty, only reels. you could've learned react in that time but instead you chose chaos. unironically kind of iconic tho, stay cooked bestie 💀";

const NO_KEY_MESSAGE =
  "Go to Settings tab and add your OpenRouter API key first bestie 💀";

const SYSTEM_PROMPT =
  "You are a savage but funny Gen Z roast bot. You roast people's internet habits brutally but end with one wholesome line. Keep it under 150 words. Use brainrot slang naturally — no cap, fr fr, cooked, ate, understood the assignment. No hashtags. Conversational tone only.";

// ─── API Key Management ──────────────────────────────────────────────────────

/**
 * Save the OpenRouter API key to chrome.storage.local.
 * @param {string} key — the API key
 */
export async function saveAPIKey(key) {
  await chrome.storage.local.set({ openrouter_api_key: key });
}

/**
 * Retrieve the stored OpenRouter API key.
 * @returns {Promise<string|null>}
 */
export async function getAPIKey() {
  const { openrouter_api_key } = await chrome.storage.local.get("openrouter_api_key");
  return openrouter_api_key || null;
}

// ─── Roast Generation ────────────────────────────────────────────────────────

/**
 * Call Grok 3 Mini via OpenRouter to generate a personalised roast.
 *
 * @param {string} prompt — the full prompt string (from buildRoastPrompt)
 * @returns {Promise<string>} — the roast text
 */
export async function generateRoast(prompt) {
  const apiKey = await getAPIKey();

  if (!apiKey) {
    console.warn("BrainRot: No OpenRouter API key set");
    return NO_KEY_MESSAGE;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "chrome-extension://brainrotscore",
        "X-Title": "BrainRot Score",
      },
      body: JSON.stringify({
        model: "x-ai/grok-3-mini",
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`BrainRot: OpenRouter API error ${response.status}:`, errorBody);
      return FALLBACK_ROAST;
    }

    const data = await response.json();

    // Extract text from OpenAI-compatible response shape
    if (
      data.choices &&
      data.choices.length > 0 &&
      data.choices[0].message &&
      data.choices[0].message.content
    ) {
      return data.choices[0].message.content.trim();
    }

    console.warn("BrainRot: Unexpected API response shape", data);
    return FALLBACK_ROAST;
  } catch (err) {
    console.error("BrainRot: Failed to call OpenRouter API", err);
    return FALLBACK_ROAST;
  }
}
