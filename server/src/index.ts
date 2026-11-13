import "dotenv/config";
import { createApp } from "./app.js";
import { createAnthropicLlm } from "./anthropicLlm.js";
import { createMockLlm } from "./mockLlm.js";

// Stable extension id: derived from the "key" in extension/public/manifest.json.
const DEFAULT_ORIGIN = "chrome-extension://dncappfhfginimfcnmcndijoophkdcpl";

const port = Number(process.env.PORT ?? 8787);
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGIN).split(",").map((s) => s.trim()).filter(Boolean);

let llm;
if (process.env.MOCK_LLM === "1") {
  console.log("Tether server: MOCK_LLM=1, using canned responses (no API key needed).");
  llm = createMockLlm();
} else {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env, or run with MOCK_LLM=1.");
    process.exit(1);
  }
  llm = createAnthropicLlm({ apiKey, model, baseURL: process.env.ANTHROPIC_BASE_URL });
}

createApp({ llm, allowedOrigins, rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MIN ?? 60), trustProxy: process.env.TRUST_PROXY === "1" })
  .listen(port, () => console.log(`Tether server on http://localhost:${port} (model ${model})`));
