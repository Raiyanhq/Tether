import { useCallback, useEffect, useRef, useState } from "react";
import { clearLog, emptyLog, loadLog, saveLog, type StruggleLog } from "../lib/log";
import { onItemChange } from "../lib/storage";
import { applyPrefs, DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from "../lib/prefs";
import { chatStream, type ChatContext, type ChatMessage } from "../lib/api";

export function useLog() {
  const [log, setLog] = useState<StruggleLog>(emptyLog());
  const ref = useRef(log);
  useEffect(() => {
    loadLog().then((l) => { ref.current = l; setLog(l); });
    return onItemChange<StruggleLog>("local", "struggleLog", (v) => {
      const l = { ...emptyLog(), ...(v ?? {}) };
      ref.current = l;
      setLog(l);
    });
  }, []);
  const update = useCallback((fn: (l: StruggleLog) => StruggleLog) => {
    const next = fn(ref.current);
    ref.current = next;
    setLog(next);
    void saveLog(next);
  }, []);
  const clear = useCallback(async () => {
    ref.current = emptyLog();
    setLog(ref.current);
    await clearLog();
  }, []);
  /** Latest log without waiting for a re-render (handy inside async handlers). */
  const get = useCallback(() => ref.current, []);
  return { log, update, clear, get };
}

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    applyPrefs(DEFAULT_PREFS);
    loadPrefs().then((p) => { setPrefs(p); applyPrefs(p); });
    return onItemChange<Prefs>("sync", "prefs", (v) => { if (v) { const p = { ...DEFAULT_PREFS, ...v }; setPrefs(p); applyPrefs(p); } });
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      applyPrefs(next);
      void savePrefs(next);
      return next;
    });
  }, []);
  return { prefs, update };
}

export function useReducedMotion(): boolean {
  const [rm, setRm] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const h = () => setRm(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return rm;
}

export interface UiMessage extends ChatMessage { id: number }

/** Streaming chat with a context supplied at ask time. */
export function useChat() {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const histRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    histRef.current = [];
    setMessages([]); setError(null); setBusy(false);
  }, []);

  const ask = useCallback(async (question: string, context: ChatContext, onDelta?: (soFar: string) => void): Promise<string | null> => {
    const q = question.trim();
    if (!q) return null;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null); setBusy(true);
    const history = [...histRef.current, { role: "user" as const, content: q }];
    const aId = ++idRef.current;
    setMessages((m) => [...m, { id: ++idRef.current, role: "user", content: q }, { id: aId, role: "assistant", content: "" }]);
    let answer = "";
    try {
      for await (const d of chatStream(history, context, ctrl.signal)) {
        answer += d;
        setMessages((m) => m.map((x) => (x.id === aId ? { ...x, content: answer } : x)));
        onDelta?.(answer);
      }
      histRef.current = [...history, { role: "assistant", content: answer }];
      return answer;
    } catch (e) {
      if (ctrl.signal.aborted) return null;
      setMessages((m) => m.filter((x) => x.id !== aId || x.content));
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      if (abortRef.current === ctrl) setBusy(false);
    }
  }, []);

  return { messages, busy, error, ask, reset };
}
