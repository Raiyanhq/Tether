import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { createMockLlm } from "../src/mockLlm.js";
import { BadModelOutputError, type Llm } from "../src/llm.js";

const ORIGIN = "chrome-extension://testid";
let server: Server, base: string;

const post = (path: string, body: unknown, origin: string | null = ORIGIN) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  const llm: Llm = {
    ...createMockLlm(),
    async analyzeText(req) {
      return {
        overview: "o",
        chunks: [{ id: "c1", heading: "h", takeaway: "t", details: "d" }],
        terms: [
          { term: "amortized", definition: "d", analogy: "a", whyItMatters: "w" },
          { term: "notInTheText", definition: "d", analogy: "a", whyItMatters: "w" },
        ],
      };
    },
  };
  server = createApp({ llm, allowedOrigins: [ORIGIN], rateLimitPerMinute: 1000 }).listen(0);
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });

describe("proxy", () => {
  it("health and the root status page are open, /api is not", async () => {
    expect((await fetch(base + "/health")).status).toBe(200);
    const root = await fetch(base + "/");
    expect(root.status).toBe(200);
    expect(await root.text()).toContain("Tether server is running");
    expect((await fetch(base + "/api/analyze-text")).status).toBe(403);
  });

  it("rejects missing or foreign origin", async () => {
    expect((await post("/api/analyze-text", { text: "x" }, null)).status).toBe(403);
    expect((await post("/api/analyze-text", { text: "x" }, "https://evil.example")).status).toBe(403);
  });

  it("answers CORS preflight for the extension origin only", async () => {
    const ok = await fetch(base + "/api/analyze-text", {
      method: "OPTIONS",
      headers: { Origin: ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    expect(ok.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("analyze-text drops terms that are not in the passage", async () => {
    const r = await post("/api/analyze-text", { text: "Amortized cost spreads work out." });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.terms.map((t: { term: string }) => t.term)).toEqual(["amortized"]);
  });

  it("analyze-text rejects text over the cap", async () => {
    const r = await post("/api/analyze-text", { text: "a".repeat(6001) });
    expect(r.status).toBe(413);
    expect((await r.json()).error.code).toBe("text_too_long");
  });

  it("validates request bodies", async () => {
    const r = await post("/api/analyze-text", { nope: 1 });
    expect(r.status).toBe(400);
  });

  it("lesson returns 4-8 valid steps with clean refs", async () => {
    const r = await post("/api/lesson", { problem: "factorial of 4", strugglingWith: ["call stack"] });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.steps.length).toBeGreaterThanOrEqual(4);
    const ids = new Set<string>();
    for (const s of j.steps) {
      for (const ref of s.visual.refs) expect(ids.has(ref)).toBe(true);
      ids.add(s.id);
    }
  });

  it("lesson-step returns the step with the requested id", async () => {
    const lesson = await (await post("/api/lesson", { problem: "p" })).json();
    const r = await post("/api/lesson-step", { lesson, stepId: "s3", reason: "not sure" });
    expect(r.status).toBe(200);
    expect((await r.json()).id).toBe("s3");
    expect((await post("/api/lesson-step", { lesson, stepId: "zzz", reason: "not sure" })).status).toBe(400);
  });

  it("analyze-image validates media type", async () => {
    expect((await post("/api/analyze-image", { imageBase64: "AAAA", mediaType: "image/gif" })).status).toBe(400);
    expect((await post("/api/analyze-image", { imageBase64: "AAAA", mediaType: "image/png" })).status).toBe(200);
  });

  it("chat streams SSE deltas then DONE", async () => {
    const r = await post("/api/chat", {
      messages: [{ role: "user", content: "why?" }],
      context: { type: "text", passage: "p" },
    });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const body = await r.text();
    expect(body).toContain('"delta"');
    expect(body.trim().endsWith("data: [DONE]")).toBe(true);
  });
});

describe("errors and limits", () => {
  it("maps a malformed model reply to 502 bad_model_output", async () => {
    const llm: Llm = { ...createMockLlm(), analyzeText: async () => { throw new BadModelOutputError("x"); } };
    const s = createApp({ llm, allowedOrigins: [ORIGIN] }).listen(0);
    const b = `http://localhost:${(s.address() as AddressInfo).port}`;
    const r = await fetch(b + "/api/analyze-text", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ text: "hi" }) });
    expect(r.status).toBe(502);
    expect((await r.json()).error.code).toBe("bad_model_output");
    s.close();
  });

  it("rate limits", async () => {
    const s = createApp({ llm: createMockLlm(), allowedOrigins: [ORIGIN], rateLimitPerMinute: 2 }).listen(0);
    const b = `http://localhost:${(s.address() as AddressInfo).port}`;
    const hit = () => fetch(b + "/api/analyze-text", { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: JSON.stringify({ text: "hello world." }) });
    await hit(); await hit();
    const r = await hit();
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe("rate_limited");
    s.close();
  });
});
