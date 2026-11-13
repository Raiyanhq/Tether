// Exercises the Gemini REST backend against a local fake endpoint.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createGeminiLlm } from "../src/geminiBackend.js";
import { BadModelOutputError } from "../src/llm.js";
import { UpstreamError } from "../src/llmCore.js";
import { createApp } from "../src/app.js";

let fake: Server, baseURL: string;
let replies: Array<string | number> = [];
let last: { url: string; headers: http.IncomingHttpHeaders; body: any };

const reply = (text: string) => ({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] });

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      last = { url: req.url ?? "", headers: req.headers, body: JSON.parse(data) };
      if (req.url?.includes(":streamGenerateContent")) {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        // Split one event across two writes to prove the parser buffers.
        const ev = JSON.stringify(reply("Hello "));
        res.write(`data: ${ev.slice(0, 20)}`);
        res.write(`${ev.slice(20)}\r\n\r\n`);
        res.write(`data: ${JSON.stringify(reply("there"))}\r\n\r\n`);
        res.end();
        return;
      }
      const next = replies.shift() ?? "";
      if (typeof next === "number") { res.writeHead(next); res.end("{}"); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(next === "" ? { promptFeedback: { blockReason: "SAFETY" } } : reply(next)));
    });
  }).listen(0);
  baseURL = `http://localhost:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => { fake.close(); });

const llm = () => createGeminiLlm({ apiKey: "secret-key", model: "gemini-test", baseURL });
const analysis = { overview: "o", chunks: [{ id: "c1", heading: "h", takeaway: "t", details: "d" }], terms: [] };

describe("gemini backend", () => {
  it("sends key in a header (not the URL), JSON mode, system instruction and model path", async () => {
    replies = ["```json\n" + JSON.stringify(analysis) + "\n```"];
    const out = await llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [{ term: "stack", analogy: "plates" }] });
    expect(out.chunks).toHaveLength(1);
    expect(last.url).toBe("/v1beta/models/gemini-test:generateContent");
    expect(last.url).not.toContain("secret-key");
    expect(last.headers["x-goog-api-key"]).toBe("secret-key");
    expect(last.body.generationConfig.responseMimeType).toBe("application/json");
    expect(last.body.systemInstruction.parts[0].text).toContain("stack: plates");
    expect(last.body.contents[0].role).toBe("user");
  });

  it("retries once on malformed or blocked replies, then succeeds", async () => {
    replies = ["", JSON.stringify(analysis)];
    expect((await llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] })).overview).toBe("o");
  });

  it("throws BadModelOutputError when the retry also fails", async () => {
    replies = ["nope", '{"overview":"x"}'];
    await expect(llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] })).rejects.toBeInstanceOf(BadModelOutputError);
  });

  it("surfaces provider errors as UpstreamError with the status", async () => {
    replies = [429];
    await expect(llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] })).rejects.toMatchObject({ status: 429 });
    replies = [403];
    await expect(llm().analyzeText({ text: "hello", knownTerms: [], pinnedAnalogies: [] })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("sends images as inlineData", async () => {
    replies = [JSON.stringify({ summary: "s", components: [] })];
    await llm().analyzeImage({ imageBase64: "AAAA", mediaType: "image/png" });
    expect(last.body.contents[0].parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: "AAAA" } });
  });

  it("streams chat with model/user roles and reassembles split SSE events", async () => {
    const parts: string[] = [];
    const it = llm().chat({
      messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }, { role: "user", content: "why" }],
      context: { type: "text", passage: "p" },
    });
    for await (const d of it) parts.push(d);
    expect(parts.join("")).toBe("Hello there");
    expect(last.url).toContain(":streamGenerateContent?alt=sse");
    expect(last.body.contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
  });

  it("attaches the image to the first user turn in image chat", async () => {
    for await (const _ of llm().chat({ messages: [{ role: "user", content: "what is B?" }], context: { type: "image", imageBase64: "BBBB", mediaType: "image/jpeg" } })) { /* drain */ }
    expect(last.body.contents[0].parts[0].inlineData.data).toBe("BBBB");
  });

  it("works end to end through the proxy: provider failure becomes a clean 502", async () => {
    const ORIGIN = "chrome-extension://x";
    const s = createApp({ llm: llm(), allowedOrigins: [ORIGIN] }).listen(0);
    const b = `http://localhost:${(s.address() as AddressInfo).port}`;
    replies = [500];
    const r = await fetch(b + "/api/analyze-text", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ text: "hi" }) });
    expect(r.status).toBe(502);
    expect((await r.json()).error.code).toBe("upstream");
    s.close();
  });
});
