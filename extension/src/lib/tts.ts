// Natural voice (ElevenLabs via the server). The audio comes with per-character timings, so the
// narration text can be highlighted word by word exactly as it is spoken.
import { requestSpeech, fetchVoiceAvailable, type SpeechResponse } from "./api";

export interface Word { start: number; end: number; at: number } // char range in the text, and audio time in seconds
export interface Prepared { url: string; words: Word[] }

/** Group the per-character timings into words. Character i of the alignment is character i of the text. */
export function wordsFromAlignment(a: NonNullable<SpeechResponse["alignment"]>): Word[] {
  const words: Word[] = [];
  const chars = a.characters;
  let i = 0;
  while (i < chars.length) {
    if (/\s/.test(chars[i])) { i++; continue; }
    const start = i;
    while (i < chars.length && !/\s/.test(chars[i])) i++;
    words.push({ start, end: i, at: a.starts[start] ?? 0 });
  }
  return words;
}

const cache = new Map<string, Promise<Prepared>>();
const MAX_CACHED = 24;

function b64ToBlobUrl(b64: string, mime: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** Fetches (and caches) the audio for a line of narration. */
export function prepareSpeech(text: string): Promise<Prepared> {
  const hit = cache.get(text);
  if (hit) return hit;
  const p = requestSpeech(text).then((r) => ({
    url: b64ToBlobUrl(r.audioBase64, r.mimeType),
    words: r.alignment ? wordsFromAlignment(r.alignment) : [],
  }));
  cache.set(text, p);
  p.catch(() => cache.delete(text)); // a failure must not stay cached
  if (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string;
    void cache.get(oldest)?.then((x) => URL.revokeObjectURL(x.url), () => {});
    cache.delete(oldest);
  }
  return p;
}

/** Warm the cache for the next step so there is no gap between steps. Errors are ignored here. */
export const prefetchSpeech = (text: string) => { void prepareSpeech(text).catch(() => {}); };

export interface PlayOpts {
  rate: number;
  onBoundary?: (start: number, end: number) => void;
  onEnd: () => void;
  onError: () => void;
}

/** Plays prepared audio. Returns a cancel function (used for barge-in). */
export function playPrepared(p: Prepared, o: PlayOpts): () => void {
  const audio = new Audio(p.url);
  audio.playbackRate = o.rate; // pitch is preserved by default
  let done = false, raf = 0, lastWord = -1;
  const finish = (fn: () => void) => { if (!done) { done = true; cancelAnimationFrame(raf); fn(); } };

  const tick = () => {
    if (done) return;
    // audio.currentTime is media time, the same clock the alignment uses, whatever the playback rate.
    let w = lastWord;
    while (w + 1 < p.words.length && p.words[w + 1].at <= audio.currentTime) w++;
    if (w !== lastWord && w >= 0) { lastWord = w; o.onBoundary?.(p.words[w].start, p.words[w].end); }
    raf = requestAnimationFrame(tick);
  };

  audio.onended = () => finish(o.onEnd);
  audio.onerror = () => finish(o.onError);
  audio.play().then(() => { raf = requestAnimationFrame(tick); }, () => finish(o.onError));
  return () => { done = true; cancelAnimationFrame(raf); audio.pause(); audio.removeAttribute("src"); };
}

let status: Promise<boolean> | null = null;
/** Cached per panel session; pass force to re-check (for example after the server was restarted). */
export function getVoiceAvailable(force = false): Promise<boolean> {
  if (!status || force) status = fetchVoiceAvailable();
  return status;
}
