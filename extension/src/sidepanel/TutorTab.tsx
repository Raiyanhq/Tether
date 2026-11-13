import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, requestLesson, requestLessonStep } from "../lib/api";
import { DEMO_LESSON, DEMO_PROBLEM } from "../lib/demo";
import { prepareImage, type PreparedImage } from "../lib/image";
import { addNotSure, pinnedAnalogies, topStruggles, type StruggleLog } from "../lib/log";
import type { Prefs } from "../lib/prefs";
import type { Lesson, Step } from "../lib/schemas";
import { getItem, setItem } from "../lib/storage";
import { listen, recognitionSupported, requestMic, speak, stopSpeaking, ttsSupported, watchLevel, type Listener } from "../lib/speech";
import { getVoiceAvailable, playPrepared, prefetchSpeech, prepareSpeech } from "../lib/tts";
import { ErrorBox, Skeleton } from "./components/Common";
import { useChat, useReducedMotion } from "./hooks";
import { Notepad } from "./Notepad";

type Status = "idle" | "loading" | "playing" | "paused" | "stopped" | "checkpoint" | "asking" | "done";

interface Props {
  log: StruggleLog;
  update: (fn: (l: StruggleLog) => StruggleLog) => void;
  getLog: () => StruggleLog;
  prefs: Prefs;
  updatePrefs: (p: Partial<Prefs>) => void;
  active: boolean;
  seedProblem: { text: string; nonce: number } | null;
}

const CACHE_KEY = "lessonCache";
interface CacheEntry { key: string; lesson: Lesson; line: string | null }
const cacheKey = (p: string) => p.trim().toLowerCase();

/** The voice service takes up to 1500 characters per request; cut at a sentence end if an answer is longer. */
function clip(text: string): string {
  if (text.length <= 1500) return text;
  const cut = text.slice(0, 1500);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > 200 ? cut.slice(0, end + 1) : cut;
}

const topicOf = (s: Step) => s.topic ?? (s.visual.content || s.narration).split(/\s+/).slice(0, 5).join(" ");

export function TutorTab({ log, update, getLog, prefs, updatePrefs, active, seedProblem }: Props) {
  const reduced = useReducedMotion();
  const [problem, setProblem] = useState("");
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [startedFrom, setStartedFrom] = useState<string | null>(null);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [index, setIndex] = useState(0);
  const [hl, setHl] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [micMsg, setMicMsg] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [lessonProblem, setLessonProblem] = useState("");
  const [lessonImage, setLessonImage] = useState<string | null>(null);

  const chat = useChat();
  const lessonRef = useRef<Lesson | null>(null);
  const token = useRef(0);
  const cancelSpeech = useRef<() => void>(() => {});
  const timer = useRef<number | undefined>(undefined);
  const statusRef = useRef<Status>("idle");
  const indexRef = useRef(0);
  const resumeRef = useRef<"replay" | "checkpoint" | "done">("replay");
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const listener = useRef<Listener | null>(null);
  const stopLevel = useRef<(() => void) | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const sessionAsk = useRef<(q: string) => void>(() => {});
  const ttsAvailableRef = useRef(false);
  const naturalBroken = useRef(false); // set when the natural voice fails, so we stop retrying it this session
  const useNatural = () => prefsRef.current.voiceNatural && ttsAvailableRef.current && !naturalBroken.current;

  const setStat = (s: Status) => { statusRef.current = s; setStatus(s); };
  const setIdx = (i: number) => { indexRef.current = i; setIndex(i); };
  const setLessonBoth = (l: Lesson | null) => { lessonRef.current = l; setLesson(l); };

  const struggles = topStruggles(log);

  useEffect(() => {
    if (seedProblem) setProblem(seedProblem.text);
  }, [seedProblem]);

  // Is the natural voice (ElevenLabs) set up on the server? Checked when the Tutor tab is shown.
  useEffect(() => {
    if (!active) return;
    let live = true;
    void getVoiceAvailable().then((v) => { if (live) { ttsAvailableRef.current = v; setTtsAvailable(v); } });
    return () => { live = false; };
  }, [active]);

  // ---------- playback ----------
  const halt = useCallback(() => {
    token.current++;
    cancelSpeech.current();
    cancelSpeech.current = () => {};
    window.clearTimeout(timer.current);
    stopSpeaking();
    setHl(null);
  }, []);

  const playStep = useCallback((i: number) => {
    const l = lessonRef.current;
    if (!l) return;
    halt();
    const t = token.current;
    setStat("playing");
    setQuestion(""); setAnswer("");
    const step = l.steps[i];
    const after = () => {
      if (t !== token.current) return;
      setHl(null);
      const cur = lessonRef.current!.steps[i];
      if (cur.checkpoint) setStat("checkpoint");
      else if (i >= lessonRef.current!.steps.length - 1) setStat("done");
      else timer.current = window.setTimeout(() => { if (t === token.current) playStep(i + 1); }, reduced ? 0 : 500);
    };
    // The step is revealed (and the pen starts writing) at the moment its voice starts, so they stay in sync.
    const reveal = () => { setIdx(i); setPreparing(false); };
    const { muteVoice, voiceRate } = prefsRef.current;
    const readSilently = () => {
      reveal();
      // Reading silently: roughly 160 words per minute, scaled by the speed slider.
      const words = step.narration.split(/\s+/).length;
      timer.current = window.setTimeout(after, Math.max(2000, (words * 375) / voiceRate));
    };
    const browserVoice = () => {
      reveal();
      cancelSpeech.current = speak(step.narration, {
        rate: voiceRate,
        onBoundary: (s, e) => { if (t === token.current) setHl([s, e]); },
        onEnd: after,
      });
    };
    const fallBack = () => {
      naturalBroken.current = true;
      setVoiceNote("The natural voice isn't responding, so Tether switched to your browser's voice.");
      if (ttsSupported()) browserVoice(); else readSilently();
    };

    if (muteVoice) { readSilently(); return; }
    if (useNatural()) {
      setPreparing(true);
      prepareSpeech(step.narration).then((prep) => {
        if (t !== token.current) return;
        reveal();
        cancelSpeech.current = playPrepared(prep, {
          rate: voiceRate,
          onBoundary: (st, en) => { if (t === token.current) setHl([st, en]); },
          onEnd: after,
          onError: () => { if (t === token.current) fallBack(); },
        });
        const next = l.steps[i + 1];
        if (next) prefetchSpeech(next.narration); // no gap between steps
      }).catch(() => { if (t === token.current) fallBack(); });
      return;
    }
    if (ttsSupported()) browserVoice(); else readSilently();
  }, [halt, reduced]);

  const pause = () => { halt(); setStat("paused"); };
  const resume = () => playStep(indexRef.current);
  const stop = () => { halt(); if (statusRef.current === "playing") setStat("stopped"); };

  const goTo = (i: number) => {
    const l = lessonRef.current;
    if (!l) return;
    const n = Math.max(0, Math.min(l.steps.length - 1, i));
    if (statusRef.current === "playing") { playStep(n); return; }
    halt();
    setIdx(n);
    setStat("paused");
  };

  /** Barge-in: stop talking immediately and open the question panel for the current step. */
  const interrupt = useCallback((at?: number) => {
    const s = statusRef.current;
    if (!lessonRef.current || s === "loading" || s === "idle") return;
    if (s === "playing" || s === "paused" || s === "stopped") resumeRef.current = "replay";
    else if (s === "checkpoint") resumeRef.current = "checkpoint";
    else if (s === "done") resumeRef.current = "done";
    halt();
    if (at !== undefined) setIdx(at);
    chat.reset();
    setAnswer("");
    setStat("asking");
  }, [halt, chat]);

  const continueAfterAsk = () => {
    chat.reset(); setAnswer(""); stopSpeaking();
    if (resumeRef.current === "checkpoint") setStat("checkpoint");
    else if (resumeRef.current === "done") setStat("done");
    else playStep(indexRef.current);
  };

  // ---------- lesson loading ----------
  const readCache = async (p: string): Promise<CacheEntry | undefined> =>
    (await getItem<CacheEntry[]>("local", CACHE_KEY, [])).find((e) => e.key === cacheKey(p));
  const writeCache = async (e: CacheEntry) => {
    const all = await getItem<CacheEntry[]>("local", CACHE_KEY, []);
    await setItem("local", CACHE_KEY, [e, ...all.filter((x) => x.key !== e.key)].slice(0, 5));
  };

  const start = async () => {
    const p = problem.trim();
    if (!p && !image) return;
    halt(); setError(null); setOfflineCopy(false); setStat("loading"); setLessonBoth(null);
    const cur = getLog();
    const s = topStruggles(cur);
    const key = p || "image problem";
    let l: Lesson;
    try {
      l = await requestLesson({
        problem: p || "Work through the problem shown in the image.",
        imageBase64: image?.base64, mediaType: image?.mediaType,
        strugglingWith: s.strugglingWith, pinnedAnalogies: pinnedAnalogies(cur),
      });
      void writeCache({ key, lesson: l, line: s.line });
      setStartedFrom(s.line);
    } catch (e) {
      // Bad conference wifi: fall back to a saved copy of this exact problem, or the built-in demo lesson.
      const cached = await readCache(key);
      if (cached && e instanceof ApiError && e.kind === "network") { l = cached.lesson; setStartedFrom(cached.line); setOfflineCopy(true); }
      else if (cacheKey(p) === cacheKey(DEMO_PROBLEM) && e instanceof ApiError && e.kind === "network") { l = DEMO_LESSON; setStartedFrom(s.line); setOfflineCopy(true); }
      else { setError(e instanceof Error ? e.message : "Could not make a lesson."); setStat("idle"); return; }
    }
    ttsAvailableRef.current = await getVoiceAvailable(); // settle this before the first step plays
    setTtsAvailable(ttsAvailableRef.current);
    setLessonProblem(p || "The problem in the picture");
    setLessonImage(image?.dataUrl ?? null);
    setLessonBoth(l);
    playStep(0);
  };

  const replaceStep = (s: Step) => {
    const l = lessonRef.current!;
    setLessonBoth({ ...l, steps: l.steps.map((x) => (x.id === s.id ? s : x)) });
  };

  const regenerate = async (reason: "not sure" | "explain differently") => {
    const l = lessonRef.current!;
    const step = l.steps[indexRef.current];
    setBusy(true); setError(null);
    try {
      const s = await requestLessonStep({ lesson: { title: l.title, goal: l.goal, steps: l.steps }, stepId: step.id, reason, strugglingWith: topStruggles(getLog()).strugglingWith });
      replaceStep(s);
      chat.reset(); setAnswer("");
      playStep(indexRef.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rewrite that step.");
    } finally { setBusy(false); }
  };

  const notSure = () => {
    const l = lessonRef.current!;
    const step = l.steps[indexRef.current];
    update((cur) => addNotSure(cur, { topic: topicOf(step), stepId: step.id, lessonTitle: l.title }));
    void regenerate("not sure");
  };

  const gotIt = () => {
    const l = lessonRef.current!;
    if (indexRef.current >= l.steps.length - 1) setStat("done");
    else playStep(indexRef.current + 1);
  };

  // ---------- asking ----------
  const speakAnswer = (text: string) => {
    const { muteVoice, voiceRate } = prefsRef.current;
    if (muteVoice) return;
    const t = token.current;
    const browser = () => { if (ttsSupported()) cancelSpeech.current = speak(text, { rate: voiceRate, onEnd: () => {} }); };
    if (!useNatural()) { browser(); return; }
    prepareSpeech(text).then((prep) => {
      if (t !== token.current || statusRef.current !== "asking") return;
      cancelSpeech.current = playPrepared(prep, { rate: voiceRate, onEnd: () => {}, onError: browser });
    }).catch(() => { if (t === token.current) browser(); });
  };

  const askQuestion = useCallback(async (q: string) => {
    const l = lessonRef.current;
    if (!l || !q.trim()) return;
    if (statusRef.current !== "asking") interrupt();
    setQuestion("");
    const i = indexRef.current;
    const text = await chat.ask(q, { type: "lesson-step", title: l.title, stepsSoFar: l.steps.slice(0, i + 1), currentStep: l.steps[i] }, setAnswer);
    if (text && statusRef.current === "asking") speakAnswer(clip(text));
  }, [chat, interrupt]);
  sessionAsk.current = askQuestion;

  // ---------- voice input ----------
  const stopVoice = useCallback(() => {
    listener.current?.stop(); listener.current = null;
    stopLevel.current?.(); stopLevel.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop()); micStream.current = null;
    setListening(false); setHandsFree(false);
  }, []);
  useEffect(() => stopVoice, [stopVoice]);

  const micProblem = (p: string) => {
    setMicMsg(p === "denied"
      ? "The microphone is blocked in this panel. You can type your question instead, or allow the microphone in a tab."
      : "Voice input isn't available here. Type your question instead.");
  };

  const pushToTalk = async () => {
    if (listening) { listener.current?.stop(); return; }
    setMicMsg(null);
    if (!recognitionSupported()) { micProblem("unsupported"); return; }
    const m = await requestMic();
    if (!m.ok) { micProblem(m.problem); return; }
    m.stream.getTracks().forEach((t) => t.stop()); // permission check only; recognition opens its own input
    interrupt();
    setListening(true);
    const l = listen({
      continuous: false,
      onFinal: (t) => { void sessionAsk.current(t); },
      onError: (msg) => setMicMsg(msg),
      onEnd: () => { setListening(false); listener.current = null; },
    });
    if (!l) setListening(false); else listener.current = l;
  };

  const toggleHandsFree = async () => {
    if (handsFree) { stopVoice(); return; }
    setMicMsg(null);
    if (!recognitionSupported()) { micProblem("unsupported"); return; }
    const m = await requestMic();
    if (!m.ok) { micProblem(m.problem); return; }
    micStream.current = m.stream;
    // Loud input while the tutor is talking = barge-in. Recognition results are only used once we are in "asking".
    stopLevel.current = watchLevel(m.stream, () => { if (statusRef.current === "playing") interrupt(); });
    const begin = () => listen({
      continuous: true,
      onFinal: (t) => { if (statusRef.current === "asking") void sessionAsk.current(t); },
      onError: (msg) => setMicMsg(msg),
      onEnd: () => { if (micStream.current) listener.current = begin(); },
    });
    listener.current = begin();
    setHandsFree(true);
  };

  const openMicTab = () => { void chrome.tabs.create({ url: chrome.runtime.getURL("mic-permission.html") }); };

  // ---------- keyboard ----------
  useEffect(() => {
    if (!active || !lesson) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === "Escape") { stop(); return; }
      if (e.key === " " && tag !== "BUTTON" && tag !== "A") {
        e.preventDefault();
        const s = statusRef.current;
        if (s === "playing") pause(); else if (s === "paused" || s === "stopped") resume();
      } else if (e.key === "ArrowRight") { e.preventDefault(); goTo(indexRef.current + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); goTo(indexRef.current - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, lesson]);

  // Leaving the tab silences the tutor.
  useEffect(() => { if (!active && statusRef.current === "playing") pause(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const attach = async (f: File | undefined) => {
    if (!f) return;
    try { setImage(await prepareImage(f)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "Could not read that image."); }
  };

  const reset = () => { halt(); stopVoice(); chat.reset(); setLessonBoth(null); setStat("idle"); setError(null); setAnswer(""); };

  // ---------- render ----------
  if (!lesson) {
    return (
      <div>
        <label htmlFor="tutor-input" className="label">Type or paste a problem to work through</label>
        <textarea id="tutor-input" rows={4} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="e.g. Solve 2x + 6 = 14, or: how does recursion unwind?" />
        <div className="row">
          <label className="btn file">
            Attach a picture of the problem
            <input type="file" accept="image/*" className="sr-only-file" onChange={(e) => void attach(e.target.files?.[0])} />
          </label>
          {image && <button type="button" className="btn" onClick={() => setImage(null)}>Remove picture</button>}
        </div>
        {image && <img className="thumb" src={image.dataUrl} alt="The problem you attached" />}

        {struggles.line && (
          <div className="memory" role="note">
            <strong>From your history:</strong> {struggles.line}
          </div>
        )}

        <div className="row">
          <button type="button" className="btn primary" disabled={(!problem.trim() && !image) || status === "loading"} onClick={() => void start()}>
            Start lesson
          </button>
          <button type="button" className="btn" disabled={status === "loading"} onClick={() => setProblem(DEMO_PROBLEM)}>Try an example</button>
        </div>
        {status === "loading" && <Skeleton label="Writing your lesson…" />}
        {error && <ErrorBox message={error} onRetry={() => void start()} />}
        {!error && status !== "loading" && <p className="muted">Tether talks you through it in 4 to 8 steps and writes the working on a notepad. You can interrupt any time.</p>}
      </div>
    );
  }

  const step = lesson.steps[index];
  const revealed = lesson.steps.slice(0, index + 1);
  const narration = step.narration;
  const playing = status === "playing";

  return (
    <div className="tutor" tabIndex={-1}>
      <h2 className="h2">{lesson.title}</h2>
      <p className="muted">{lesson.goal}</p>
      {startedFrom && <div className="memory" role="note"><strong>From your history:</strong> {startedFrom}</div>}
      {offlineCopy && <div className="notice" role="status">You're offline, so this is a saved copy of the lesson.</div>}

      <div className="controls" role="toolbar" aria-label="Lesson controls">
        <button type="button" className="btn" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous step">←</button>
        <button type="button" className="btn primary" onClick={() => (playing ? pause() : resume())} disabled={status === "checkpoint" || status === "asking" || status === "done"}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className="btn" onClick={() => goTo(index + 1)} disabled={index >= lesson.steps.length - 1} aria-label="Next step">→</button>
        <button type="button" className="btn" onClick={stop}>Stop</button>
        <button type="button" className="btn" onClick={() => interrupt()}>Ask about this step</button>
        <button type="button" className="btn" onClick={reset}>New problem</button>
      </div>
      <p className="muted small">Keys: Space pause or play · ← → change step · Esc stop</p>
      <div className="progress" aria-hidden="true">
        {lesson.steps.map((st, i) => <span key={st.id} className={i <= index ? "done" : ""} />)}
      </div>
      <p className="step-count" aria-live="polite">Step {index + 1} of {lesson.steps.length}{status === "stopped" ? " · stopped" : status === "paused" ? " · paused" : ""}{preparing ? " · getting the voice ready…" : ""}</p>

      <div className="row options">
        {ttsAvailable && (
          <label className="check"><input type="checkbox" checked={prefs.voiceNatural} onChange={(e) => { naturalBroken.current = false; setVoiceNote(null); updatePrefs({ voiceNatural: e.target.checked }); }} /> Natural voice</label>
        )}
        <label className="check"><input type="checkbox" checked={prefs.handwriting} onChange={(e) => updatePrefs({ handwriting: e.target.checked })} /> Handwriting style</label>
        <label className="check"><input type="checkbox" checked={prefs.muteVoice} onChange={(e) => { updatePrefs({ muteVoice: e.target.checked }); if (e.target.checked) stopSpeaking(); }} /> Mute voice, read silently</label>
        <label className="check">Speed {prefs.voiceRate.toFixed(2)}×
          <input type="range" min={0.8} max={1.2} step={0.05} value={prefs.voiceRate} onChange={(e) => updatePrefs({ voiceRate: Number(e.target.value) })} />
        </label>
      </div>

      {voiceNote && <div className="notice" role="status">{voiceNote}</div>}

      <div className="narration" aria-live="off">
        <span className="sr-only">Tutor says: </span>
        {hl ? (<>{narration.slice(0, hl[0])}<mark>{narration.slice(hl[0], hl[1])}</mark>{narration.slice(hl[1])}</>) : narration}
      </div>

      <Notepad steps={revealed} activeIndex={index} reducedMotion={reduced} handwriting={prefs.handwriting} problem={lessonProblem} problemImage={lessonImage} onSelectStep={(i) => interrupt(i)} onPadClick={() => { if (statusRef.current === "playing") interrupt(); }} />

      {status === "checkpoint" && step.checkpoint && (
        <section className="panel" aria-labelledby="cp-title">
          <h3 id="cp-title" className="h3">Quick check</h3>
          <p>{step.checkpoint}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={gotIt}>I've got it</button>
            <button type="button" className="btn" disabled={busy} onClick={notSure}>Not sure</button>
          </div>
        </section>
      )}

      {status === "asking" && (
        <section className="panel" aria-labelledby="ask-title">
          <h3 id="ask-title" className="h3">Ask about step {index + 1}</h3>
          <form className="row" onSubmit={(e) => { e.preventDefault(); void askQuestion(question); }}>
            <label htmlFor="ask-q" className="sr-only">Your question</label>
            <input id="ask-q" type="text" autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Type your question" />
            <button type="submit" className="btn primary" disabled={chat.busy || !question.trim()}>Ask</button>
          </form>
          <div className="row">
            <button type="button" className="btn" aria-pressed={listening} onClick={() => void pushToTalk()}>{listening ? "Listening… tap to send" : "Push to talk"}</button>
            <button type="button" className="btn" aria-pressed={handsFree} onClick={() => void toggleHandsFree()}>{handsFree ? "Hands-free: on" : "Hands-free: off"}</button>
          </div>
          {micMsg && <div className="notice" role="status">{micMsg} <button type="button" className="link" onClick={openMicTab}>Allow microphone in a tab</button></div>}
          <div aria-live="polite" className="answer">{chat.busy && !answer ? "Thinking…" : answer}</div>
          {chat.error && <ErrorBox message={chat.error} />}
          <div className="row">
            <button type="button" className="btn primary" onClick={continueAfterAsk}>Got it, continue</button>
            <button type="button" className="btn" disabled={busy} onClick={() => void regenerate("explain differently")}>Explain that step differently</button>
          </div>
        </section>
      )}

      {status === "done" && (
        <section className="panel" aria-labelledby="done-title">
          <h3 id="done-title" className="h3">Done</h3>
          <p><strong>Common mistake:</strong> {lesson.commonMistake}</p>
          <div className="row">
            <button type="button" className="btn" onClick={() => playStep(0)}>Replay</button>
            <button type="button" className="btn primary" onClick={reset}>New problem</button>
          </div>
        </section>
      )}

      {error && <ErrorBox message={error} />}
      {busy && <p className="muted" role="status">Rewriting that step…</p>}
    </div>
  );
}
