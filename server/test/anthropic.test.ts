// Exercises the real Anthropic SDK code path against a local fake /v1/messages endpoint.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createAnthropicLlm, extractJson } from "../src/anthropicLlm.js";
import { BadModelOutputError } from "../src/llm.js";

let fake: Server, baseURL: string;
let replies: string[] = [];
let lastBody: any;

function msg(text: string) {
  return { id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
}

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      lastBody = JSON.parse(data);
      if (lastBody.stream) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        const ev = (t: string, d: unknown) => res.write(`event: ${t}\ndata: ${JSON.stringify(d)}\n\n`);
        ev("message_start", { type: "message_start", message: { ...msg(""), content: [] } });
        ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
        for (const w of ["Hello ", "there"]) ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: w } });
        ev("content_block_stop", { type: "content_block_stop", index: 0 });
        ev("message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } });
        ev("message_stop", { type: "message_stop" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(msg(replies.shift() ?? "")));
      }
    });
  }).listen(0);
  baseURL = `http://localhost:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => { fake.close(); });

const llm = () => createAnthropicLlm({ apiKey: "k", model: "claude-sonnet-5-5", baseURL });
const analysis = { overview: "o", chunks: [{ id: "c1", heading: "h", takeaway: "t", details: "d" }], terms: [] };

describe("anthropic llm", () => {
  it("extractJson tolerates fences and prose", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('here {"a":2} done')).toEqual({ a: 2 });
  });

  it("sends the configured model and parses a good reply", async () => {
    replies = [JSON.stringify(analysis)];
    const out = await llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [{ term: "stack", analogy: "plates" }] });
    expect(out.chunks).toHaveLength(1);
    expect(lastBody.model).toBe("claude-sonnet-5-5");
    expect(lastBody.system).toContain("stack: plates");
  });

  it("retries once on malformed JSON, then succeeds", async () => {
    replies = ["not json at all", JSON.stringify(analysis)];
    const out = await llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] });
    expect(out.overview).toBe("o");
  });

  it("throws BadModelOutputError after the retry also fails", async () => {
    replies = ["nope", '{"overview":"x"}'];
    await expect(llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] })).rejects.toBeInstanceOf(BadModelOutputError);
  });

  it("streams chat deltas", async () => {
    const parts: string[] = [];
    for await (const d of llm().chat({ messages: [{ role: "user", content: "hi" }], context: { type: "text", passage: "p" } })) parts.push(d);
    expect(parts.join("")).toBe("Hello there");
  });

  it("sends the image block for analyze-image", async () => {
    replies = [JSON.stringify({ summary: "s", components: [] })];
    await llm().analyzeImage({ imageBase64: "AAAA", mediaType: "image/png" });
    expect(lastBody.messages[0].content[0].type).toBe("image");
  });
});
