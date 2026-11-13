import Anthropic from "@anthropic-ai/sdk";
import { createLlm, UpstreamError, type Backend, type Part } from "./llmCore.js";

const toBlocks = (parts: Part[]): Anthropic.ContentBlockParam[] =>
  parts.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } }
  );

export function anthropicBackend(opts: { apiKey: string; model: string; baseURL?: string }): Backend {
  const client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  const wrap = (e: unknown): never => {
    const status = (e as { status?: number })?.status;
    throw typeof status === "number" ? new UpstreamError(status, "Anthropic request failed") : e;
  };
  return {
    async complete({ system, parts, maxTokens }) {
      try {
        const res = await client.messages.create({
          model: opts.model, max_tokens: maxTokens, system,
          messages: [{ role: "user", content: toBlocks(parts) }],
        });
        return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      } catch (e) { return wrap(e); }
    },
    async *stream({ system, messages, maxTokens }) {
      try {
        const s = client.messages.stream({
          model: opts.model, max_tokens: maxTokens, system,
          messages: messages.map((m) => ({ role: m.role, content: toBlocks(m.parts) })),
        });
        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
        }
      } catch (e) { wrap(e); }
    },
  };
}

export const createAnthropicLlm = (opts: Parameters<typeof anthropicBackend>[0]) => createLlm(anthropicBackend(opts));
