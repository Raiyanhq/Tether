import { createLlm, UpstreamError, type Backend, type Part } from "./llmCore.js";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com";

const toParts = (parts: Part[]) =>
  parts.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mediaType, data: p.data } }));

interface GeminiChunk {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const textOf = (c: GeminiChunk) => (c.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");

/** Gemini API over plain REST (no SDK). The key goes in a header, never in the URL. */
export function geminiBackend(opts: { apiKey: string; model: string; baseURL?: string; retryDelayMs?: number }): Backend {
  const base = (opts.baseURL ?? DEFAULT_BASE).replace(/\/$/, "");
  const url = (method: string, query = "") => `${base}/v1beta/models/${encodeURIComponent(opts.model)}:${method}${query}`;
  const headers = { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey };

  // Thinking models count their reasoning against the output cap, so never go below a roomy floor.
  const cap = (n: number) => Math.max(n, 8192);

  // Gemini sometimes answers 503 "high demand" or 429 for a moment. One quick retry rides that out.
  const RETRYABLE = new Set([429, 500, 503]);
  async function call(method: string, query: string, body: unknown): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(url(method, query), { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
      } catch {
        throw new UpstreamError(503, "Could not reach the Gemini API");
      }
      if (res.ok) return res;
      if (attempt === 0 && RETRYABLE.has(res.status)) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 1000));
        continue;
      }
      throw new UpstreamError(res.status, `Gemini API returned ${res.status}`);
    }
  }

  return {
    async complete({ system, parts, maxTokens }) {
      const res = await call("generateContent", "", {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: toParts(parts) }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: cap(maxTokens) },
      });
      // A blocked or empty reply comes back as "" and is handled by the shared validate-and-retry step.
      return textOf((await res.json()) as GeminiChunk);
    },

    async *stream({ system, messages, maxTokens }) {
      const res = await call("streamGenerateContent", "?alt=sse", {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: toParts(m.parts) })),
        generationConfig: { maxOutputTokens: cap(maxTokens) },
      });
      if (!res.body) throw new UpstreamError(502, "Gemini returned no body");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
          const data = block.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
          if (!data) continue;
          const t = textOf(JSON.parse(data) as GeminiChunk);
          if (t) yield t;
        }
      }
    },
  };
}

export const createGeminiLlm = (opts: Parameters<typeof geminiBackend>[0]) => createLlm(geminiBackend(opts));
