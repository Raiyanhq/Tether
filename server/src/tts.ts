import { UpstreamError } from "./llmCore.js";

export interface Alignment { characters: string[]; starts: number[]; ends: number[] }
export interface SpeechResult { audioBase64: string; mimeType: string; alignment?: Alignment }

/** Text to speech. The key stays on the server; the extension only ever calls /api/speak. */
export interface Tts {
  available: boolean;
  speak(text: string): Promise<SpeechResult>;
}

export const unavailableTts: Tts = {
  available: false,
  async speak() { throw new Error("TTS is not configured"); },
};

interface ElevenOpts { apiKey: string; voiceId: string; model: string; baseURL?: string; retryDelayMs?: number }

interface ElevenResponse {
  audio_base64?: string;
  alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] } | null;
}

/** ElevenLabs text-to-speech with character timings (used to highlight the narration as it is spoken). */
export function createElevenLabsTts(o: ElevenOpts): Tts {
  const base = (o.baseURL ?? "https://api.elevenlabs.io").replace(/\/$/, "");
  const url = `${base}/v1/text-to-speech/${encodeURIComponent(o.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  const RETRYABLE = new Set([429, 500, 502, 503]);

  return {
    available: true,
    async speak(text) {
      for (let attempt = 0; ; attempt++) {
        let res: Response;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "xi-api-key": o.apiKey },
            body: JSON.stringify({ text, model_id: o.model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
            signal: AbortSignal.timeout(30_000),
          });
        } catch {
          throw new UpstreamError(503, "Could not reach ElevenLabs");
        }
        if (!res.ok) {
          if (attempt === 0 && RETRYABLE.has(res.status)) {
            await new Promise((r) => setTimeout(r, o.retryDelayMs ?? 700));
            continue;
          }
          throw new UpstreamError(res.status, `ElevenLabs returned ${res.status}`);
        }
        const j = (await res.json()) as ElevenResponse;
        if (!j.audio_base64) throw new UpstreamError(502, "ElevenLabs returned no audio");
        const a = j.alignment;
        const alignment = a?.characters && a.character_start_times_seconds && a.character_end_times_seconds
          ? { characters: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds }
          : undefined;
        return { audioBase64: j.audio_base64, mimeType: "audio/mpeg", alignment };
      }
    },
  };
}

/** Offline stand-in: a short silent WAV with matching timings, so the whole voice path can be tested without a key. */
export function createMockTts(): Tts {
  return {
    available: true,
    async speak(text) {
      const perChar = 0.02;
      const seconds = Math.min(4, Math.max(0.3, text.length * perChar));
      const rate = 8000, n = Math.floor(seconds * rate);
      const buf = Buffer.alloc(44 + n, 128); // 8-bit unsigned PCM: 128 = silence
      buf.write("RIFF", 0); buf.writeUInt32LE(36 + n, 4); buf.write("WAVEfmt ", 8);
      buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
      buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34);
      buf.write("data", 36); buf.writeUInt32LE(n, 40);
      const step = seconds / Math.max(1, text.length);
      const chars = [...text];
      return {
        audioBase64: buf.toString("base64"),
        mimeType: "audio/wav",
        alignment: { characters: chars, starts: chars.map((_, i) => i * step), ends: chars.map((_, i) => (i + 1) * step) },
      };
    },
  };
}
