import "dotenv/config";
import { createApp } from "./app.js";
import { createAnthropicLlm } from "./anthropicBackend.js";
import { createGeminiLlm } from "./geminiBackend.js";
import { createMockLlm } from "./mockLlm.js";

// Stable extension id: derived from the "key" in extension/public/manifest.json.
const DEFAULT_ORIGIN = "chrome-extension://dncappfhfginimfcnmcndijoophkdcpl";

const port = Number(process.env.PORT ?? 8787);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGIN).split(",").map((s) => s.trim()).filter(Boolean);

// Provider: LLM_PROVIDER=gemini|anthropic, otherwise whichever key is set (Gemini first).
const provider = process.env.LLM_PROVIDER || (process.env.GEMINI_API_KEY ? "gemini" : process.env.ANTHROPIC_API_KEY ? "anthropic" : "gemini");

let llm;
let label: string;
if (process.env.MOCK_LLM === "1") {
  console.log("Tether server: MOCK_LLM=1, using canned responses (no API key needed).");
  llm = createMockLlm();
  label = "mock";
} else if (provider === "gemini") {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set. Copy server/.env.example to server/.env, or run with MOCK_LLM=1.");
    process.exit(1);
  }
  const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
  llm = createGeminiLlm({ apiKey, model, baseURL: process.env.GEMINI_BASE_URL });
  label = `gemini ${model}`;
} else if (provider === "anthropic") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env, or run with MOCK_LLM=1.");
    process.exit(1);
  }
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  llm = createAnthropicLlm({ apiKey, model, baseURL: process.env.ANTHROPIC_BASE_URL });
  label = `anthropic ${model}`;
} else {
  console.error(`Unknown LLM_PROVIDER "${provider}". Use gemini or anthropic.`);
  process.exit(1);
}

createApp({ llm, allowedOrigins, rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MIN ?? 60), trustProxy: process.env.TRUST_PROXY === "1" })
  .listen(port, () => console.log(`Tether server on http://localhost:${port} (${label})`));
