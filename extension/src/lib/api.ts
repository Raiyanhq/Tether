import { z } from "zod";
import { SERVER_URL } from "./config";
import { AnalysisSchema, ImageAnalysisSchema, LessonSchema, StepSchema, type Analysis, type ImageAnalysis, type Lesson, type Step } from "./schemas";

export type ApiErrorKind = "network" | "too_long" | "rate_limited" | "bad_output" | "server";
export class ApiError extends Error {
  constructor(public kind: ApiErrorKind, message: string) { super(message); }
}

async function send(path: string, body: unknown, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(SERVER_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError("network", "Can't reach the Tether server. Check that it is running and that you are online, then try again.");
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res;
  let code = "", message = "";
  try { const j = await res.json(); code = j.error?.code ?? ""; message = j.error?.message ?? ""; } catch { /* non-JSON error */ }
  if (code === "text_too_long") throw new ApiError("too_long", message || "That is too long. Select less text.");
  if (code === "rate_limited") throw new ApiError("rate_limited", "Too many requests in a row. Wait a minute and try again.");
  if (code === "bad_model_output") throw new ApiError("bad_output", "The AI reply came back garbled. Please try again.");
  throw new ApiError("server", message || "The server had a problem. Please try again.");
}

// Validate against the schema; retry once if the reply is malformed.
async function postJson<S extends z.ZodTypeAny>(path: string, body: unknown, schema: S, timeoutMs = 45_000): Promise<z.output<S>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await send(path, body, timeoutMs);
    try {
      const parsed = schema.safeParse(await res.json());
      if (parsed.success) return parsed.data;
    } catch { /* fall through to retry */ }
  }
  throw new ApiError("bad_output", "The reply was not in the expected format. Please try again.");
}

export interface PinnedAnalogy { term: string; analogy: string }

export const analyzeText = (b: { text: string; knownTerms: string[]; pinnedAnalogies: PinnedAnalogy[] }): Promise<Analysis> =>
  postJson("/api/analyze-text", b, AnalysisSchema);

export const requestLesson = (b: {
  problem: string; imageBase64?: string; mediaType?: string; strugglingWith: string[]; pinnedAnalogies: PinnedAnalogy[];
}): Promise<Lesson> => postJson("/api/lesson", b, LessonSchema, 60_000);

export const requestLessonStep = (b: {
  lesson: { title: string; goal: string; steps: Step[] }; stepId: string; reason: "not sure" | "explain differently"; strugglingWith: string[];
}): Promise<Step> => postJson("/api/lesson-step", b, StepSchema);

export const analyzeImage = (b: { imageBase64: string; mediaType: string }): Promise<ImageAnalysis> =>
  postJson("/api/analyze-image", b, ImageAnalysisSchema);

export const extractText = (b: { imageBase64: string; mediaType: string }): Promise<{ text: string; note?: string }> =>
  postJson("/api/extract-text", b, z.object({ text: z.string(), note: z.string().nullish().transform((v) => v || undefined) }), 60_000);

export type ChatContext =
  | { type: "text"; passage: string; overview?: string }
  | { type: "image"; summary?: string; components?: { label: string; explanation: string }[]; imageBase64?: string; mediaType?: string }
  | { type: "lesson-step"; title: string; stepsSoFar: Step[]; currentStep: Step };

export interface ChatMessage { role: "user" | "assistant"; content: string }

/** Streams the answer as text deltas. */
export async function* chatStream(messages: ChatMessage[], context: ChatContext, signal?: AbortSignal): AsyncGenerator<string> {
  const res = await send("/api/chat", { messages, context }, 60_000, signal);
  if (!res.body) throw new ApiError("server", "No answer came back.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      const j = JSON.parse(data) as { delta?: string; error?: string };
      if (j.error) throw new ApiError("server", j.error);
      if (j.delta) yield j.delta;
    }
  }
}

// ---------- natural voice ----------
const SpeechSchema = z.object({
  audioBase64: z.string().min(1),
  mimeType: z.string(),
  alignment: z.object({ characters: z.array(z.string()), starts: z.array(z.number()), ends: z.array(z.number()) }).optional(),
});
export type SpeechResponse = z.infer<typeof SpeechSchema>;

export const requestSpeech = (text: string): Promise<SpeechResponse> => postJson("/api/speak", { text }, SpeechSchema, 30_000);

/** Is natural voice set up on the server? Never throws: any failure just means "use the browser voice". */
export async function fetchVoiceAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok && ((await res.json()) as { tts?: boolean }).tts === true;
  } catch {
    return false;
  }
}
