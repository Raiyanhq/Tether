import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createElevenLabsTts, createMockTts } from "../src/tts.js";
import { createApp } from "../src/app.js";
import { createMockLlm } from "../src/mockLlm.js";

let fake: Server, baseURL: string;
let replies: Array<object | number> = [];
let last: { url: string; headers: http.IncomingHttpHeaders; body: any };

beforeAll(async () => {
  fake = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      last = { url: req.url ?? "", headers: req.headers, body: JSON.parse(data) };
      const next = replies.shift() ?? {};
      if (typeof next === "number") { res.writeHead(next); res.end("{}"); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(next));
    });
  }).listen(0);
  baseURL = `http://localhost:${(fake.address() as AddressInfo).port}`;
});
afterAll(() => { fake.close(); });

const good = {
  audio_base64: "QUJD",
  alignment: { characters: ["H", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] },
};
const tts = () => createElevenLabsTts({ apiKey: "xi-secret", voiceId: "voice123", model: "eleven_flash_v2_5", baseURL, retryDelayMs: 0 });

describe("elevenlabs tts", () => {
  it("calls with-timestamps with the key in a header and maps the alignment", async () => {
    replies = [good];
    const out = await tts().speak("Hi");
    expect(last.url).toBe("/v1/text-to-speech/voice123/with-timestamps?output_format=mp3_44100_128");
    expect(last.url).not.toContain("xi-secret");
    expect(last.headers["xi-api-key"]).toBe("xi-secret");
    expect(last.body).toMatchObject({ text: "Hi", model_id: "eleven_flash_v2_5" });
    expect(out).toEqual({ audioBase64: "QUJD", mimeType: "audio/mpeg", alignment: { characters: ["H", "i"], starts: [0, 0.1], ends: [0.1, 0.2] } });
  });

  it("still returns audio when ElevenLabs sends no alignment", async () => {
    replies = [{ audio_base64: "QUJD", alignment: null }];
    expect((await tts().speak("Hi")).alignment).toBeUndefined();
  });

  it("retries once on 429, then succeeds", async () => {
    replies = [429, good];
    expect((await tts().speak("Hi")).audioBase64).toBe("QUJD");
  });

  it("surfaces auth failures with the status", async () => {
    replies = [401];
    await expect(tts().speak("Hi")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a reply with no audio", async () => {
    replies = [{}];
    await expect(tts().speak("Hi")).rejects.toMatchObject({ status: 502 });
  });

  it("mock tts produces a playable WAV with one timing per character", async () => {
    const out = await createMockTts().speak("Hello there");
    expect(Buffer.from(out.audioBase64, "base64").subarray(0, 4).toString()).toBe("RIFF");
    expect(out.alignment!.characters).toHaveLength(11);
  });
});

describe("/api/speak", () => {
  const ORIGIN = "chrome-extension://x";
  const call = async (app: ReturnType<typeof createApp>, path: string, body?: unknown) => {
    const s = app.listen(0);
    const b = `http://localhost:${(s.address() as AddressInfo).port}`;
    const r = await fetch(b + path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Origin: ORIGIN }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json();
    s.close();
    return { status: r.status, j };
  };

  it("reports tts availability on /health", async () => {
    expect((await call(createApp({ llm: createMockLlm(), allowedOrigins: [ORIGIN] }), "/health")).j).toEqual({ ok: true, tts: false });
    expect((await call(createApp({ llm: createMockLlm(), tts: createMockTts(), allowedOrigins: [ORIGIN] }), "/health")).j).toEqual({ ok: true, tts: true });
  });

  it("returns 503 tts_unavailable when no voice is configured", async () => {
    const r = await call(createApp({ llm: createMockLlm(), allowedOrigins: [ORIGIN] }), "/api/speak", { text: "hi" });
    expect(r.status).toBe(503);
    expect(r.j.error.code).toBe("tts_unavailable");
  });

  it("speaks, validates input, and stays origin-locked", async () => {
    const app = createApp({ llm: createMockLlm(), tts: createMockTts(), allowedOrigins: [ORIGIN] });
    const ok = await call(app, "/api/speak", { text: "hello" });
    expect(ok.status).toBe(200);
    expect(ok.j.audioBase64.length).toBeGreaterThan(10);
    expect((await call(app, "/api/speak", { text: "" })).status).toBe(400);
    expect((await call(app, "/api/speak", { text: "x".repeat(1501) })).status).toBe(400);
    const s = app.listen(0);
    const denied = await fetch(`http://localhost:${(s.address() as AddressInfo).port}/api/speak`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "hi" }) });
    s.close();
    expect(denied.status).toBe(403);
  });

  it("maps an ElevenLabs failure to a clean 502", async () => {
    replies = [401];
    const app = createApp({ llm: createMockLlm(), tts: tts(), allowedOrigins: [ORIGIN] });
    const r = await call(app, "/api/speak", { text: "hello" });
    expect(r.status).toBe(502);
    expect(r.j.error.code).toBe("upstream");
  });
});
