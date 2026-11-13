// Web Speech wrappers. Output: speechSynthesis. Input: SpeechRecognition.
export const ttsSupported = () => typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

// Chrome garbage-collects utterances mid-speech and then never fires onend, so keep a reference.
let current: SpeechSynthesisUtterance | null = null;

export interface SpeakOpts {
  rate: number;
  onBoundary?: (start: number, end: number) => void;
  onEnd: () => void;
}

/** Speaks text. Returns a cancel function. onEnd is guaranteed to fire (a timeout covers silent failures). */
export function speak(text: string, o: SpeakOpts): () => void {
  let done = false;
  const finish = () => { if (!done) { done = true; clearTimeout(guard); o.onEnd(); } };
  const words = text.split(/\s+/).length;
  const guard = setTimeout(finish, (words / (2.3 * o.rate)) * 1000 + 4000);
  if (!ttsSupported()) { clearTimeout(guard); setTimeout(finish, 0); return () => { done = true; }; }

  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = o.rate;
  u.onboundary = (e) => {
    if (e.name && e.name !== "word") return;
    let end = e.charIndex + (e.charLength || 0);
    if (!e.charLength) { end = text.indexOf(" ", e.charIndex); if (end < 0) end = text.length; }
    o.onBoundary?.(e.charIndex, end);
  };
  u.onend = finish;
  u.onerror = finish;
  current = u;
  speechSynthesis.speak(u);
  return () => { done = true; clearTimeout(guard); speechSynthesis.cancel(); };
}

export function stopSpeaking() {
  if (ttsSupported()) speechSynthesis.cancel();
}

// ---------- input ----------
type RecCtor = new () => SpeechRecognition;
const recCtor = (): RecCtor | undefined =>
  (globalThis as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition ??
  (globalThis as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition;

export const recognitionSupported = () => !!recCtor();

export type MicProblem = "unsupported" | "denied" | "other";

/** Ask for the microphone. Side panels can block the prompt; callers show a fallback when this fails. */
export async function requestMic(): Promise<{ ok: true; stream: MediaStream } | { ok: false; problem: MicProblem }> {
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, problem: "unsupported" };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return { ok: true, stream };
  } catch (e) {
    const name = (e as DOMException).name;
    return { ok: false, problem: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "other" };
  }
}

export interface Listener { stop: () => void }

export function listen(o: {
  continuous: boolean;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
}): Listener | null {
  const C = recCtor();
  if (!C) return null;
  const rec = new C();
  rec.lang = navigator.language || "en-US";
  rec.continuous = o.continuous;
  rec.interimResults = true;
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const t = r[0].transcript.trim();
      if (!t) continue;
      if (r.isFinal) o.onFinal(t); else o.onInterim?.(t);
    }
  };
  rec.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    o.onError(e.error === "not-allowed" ? "Microphone is blocked. Type your question instead." : `Voice input error: ${e.error}. Type your question instead.`);
  };
  rec.onend = () => o.onEnd?.();
  try { rec.start(); } catch { o.onError("Could not start voice input. Type your question instead."); return null; }
  return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}

/** Watches mic loudness; calls onLoud when above threshold for a short moment. Used for barge-in. */
export function watchLevel(stream: MediaStream, onLoud: () => void, threshold = 0.12): () => void {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let loudFrames = 0;
  const id = setInterval(() => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
    const rms = Math.sqrt(sum / buf.length);
    loudFrames = rms > threshold ? loudFrames + 1 : 0;
    if (loudFrames >= 3) { loudFrames = 0; onLoud(); }
  }, 50);
  return () => { clearInterval(id); src.disconnect(); void ctx.close(); };
}
