import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeText, ApiError } from "../lib/api";
import { MAX_TEXT_CHARS } from "../lib/config";
import { DEMO_PARAGRAPH } from "../lib/demo";
import { knownTerms, latestSession, pinnedAnalogies, recordLookup, saveSession, togglePin, type StruggleLog } from "../lib/log";
import type { Analysis, Term } from "../lib/schemas";
import { ChatBox } from "./components/ChatBox";
import { ErrorBox, Skeleton } from "./components/Common";
import { ReEntryCard } from "./components/ReEntryCard";
import { RichText } from "./components/RichText";
import { TermPopover } from "./components/TermPopover";

export interface Incoming { nonce: number; kind: "text" | "pdf"; text?: string; url?: string; title?: string }

interface Props {
  log: StruggleLog;
  update: (fn: (l: StruggleLog) => StruggleLog) => void;
  getLog: () => StruggleLog;
  bionic: boolean;
  incoming: Incoming | null;
  onWorkThrough: (question: string, title: string) => void;
}

interface Source { url: string; title: string }
const PASTED: Source = { url: "pasted text", title: "Pasted text" };
const PDF_MESSAGE = "Chrome's built-in PDF viewer doesn't let extensions read it. Copy the passage and paste it into the box above.";

export function ReadTab({ log, update, getLog, bionic, incoming, onWorkThrough }: Props) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [source, setSource] = useState<Source>(PASTED);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [openTerm, setOpenTerm] = useState<{ chunkId: string; term: Term } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const analyzedText = useRef("");
  const trigger = useRef<HTMLElement | null>(null);

  const run = useCallback(async (raw: string, src: Source) => {
    const body = raw.trim();
    if (!body) return;
    setNotice(null);
    if (body.length > MAX_TEXT_CHARS) {
      setStatus("error");
      setError({ message: `That's ${body.length.toLocaleString()} characters. Select about ${MAX_TEXT_CHARS.toLocaleString()} or fewer and try again.`, retry: false });
      return;
    }
    setStatus("loading"); setError(null); setOpenTerm(null); setOpen(new Set());
    setSource(src);
    try {
      const cur = getLog();
      const a = await analyzeText({ text: body, knownTerms: knownTerms(cur), pinnedAnalogies: pinnedAnalogies(cur) });
      analyzedText.current = body;
      setAnalysis(a);
      setStatus("done");
      const first = a.chunks[0];
      update((l) => saveSession(l, { url: src.url, title: src.title, lastChunkRead: first.id, lastHeading: first.heading, lastTakeaway: first.takeaway, openQuestion: "", at: new Date().toISOString() }));
    } catch (e) {
      setStatus("error");
      const kind = e instanceof ApiError ? e.kind : null;
      setError({ message: e instanceof Error ? e.message : "Something went wrong.", retry: kind !== "too_long" });
    }
  }, [getLog, update]);

  // Text sent from the right-click menu.
  useEffect(() => {
    if (!incoming) return;
    if (incoming.kind === "pdf") { setNotice(PDF_MESSAGE); return; }
    const t = incoming.text ?? "";
    setText(t);
    void run(t, { url: incoming.url || PASTED.url, title: incoming.title || PASTED.title });
  }, [incoming, run]);

  const grabSelection = async () => {
    setNotice(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab?.id) throw new Error("no tab");
      const r = (await chrome.tabs.sendMessage(tab.id, { type: "tether:getSelection" })) as { text: string; url: string; title: string } | undefined;
      if (!r?.text.trim()) { setNotice("Nothing is highlighted on the page. Highlight some text first, then try again."); return; }
      setText(r.text);
      void run(r.text, { url: r.url, title: r.title });
    } catch {
      setNotice(PDF_MESSAGE.replace("Chrome's built-in PDF viewer doesn't", "Tether can't read this page (for example Chrome's PDF viewer or a Chrome settings page), because it doesn't"));
    }
  };

  const toggleChunk = (id: string) => {
    const next = new Set(open);
    const opening = !next.has(id);
    if (opening) next.add(id); else next.delete(id);
    setOpen(next);
    if (opening && analysis) {
      const c = analysis.chunks.find((x) => x.id === id)!;
      update((l) => {
        const prev = l.sessions.find((s) => s.url === source.url);
        return saveSession(l, { url: source.url, title: source.title, openQuestion: prev?.openQuestion ?? "", lastChunkRead: c.id, lastHeading: c.heading, lastTakeaway: c.takeaway, at: new Date().toISOString() });
      });
    }
  };

  const onTerm = (chunkId: string) => (term: Term, el: HTMLElement) => {
    if (openTerm?.term.term === term.term && openTerm.chunkId === chunkId) { setOpenTerm(null); return; }
    trigger.current = el;
    setOpenTerm({ chunkId, term });
    update((l) => recordLookup(l, { term: term.term, url: source.url, definition: term.definition, analogy: term.analogy }));
  };

  const closeTerm = () => {
    setOpenTerm(null);
    // Popover unmount returns focus; make sure the underlined word is the target.
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const pinnedFor = (t: Term) => log.terms.find((x) => x.term.toLowerCase() === t.term.toLowerCase())?.pinnedAnalogy === t.analogy;
  const recent = latestSession(log);

  return (
    <div>
      <label htmlFor="read-input" className="label">Paste a confusing passage, or highlight text on a page</label>
      <textarea id="read-input" value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="Paste text here." />
      <div className="row">
        <button type="button" className="btn primary" disabled={!text.trim() || status === "loading"} onClick={() => run(text, PASTED)}>
          Break it down
        </button>
        <button type="button" className="btn" onClick={() => { setText(DEMO_PARAGRAPH); void run(DEMO_PARAGRAPH, { url: "demo: amortized analysis", title: "Amortized analysis (example)" }); }}>
          Try an example
        </button>
        <button type="button" className="btn" onClick={grabSelection}>Use text highlighted on the page</button>
      </div>
      <p className="muted small" aria-live="polite">{text.length > MAX_TEXT_CHARS ? `${text.length.toLocaleString()} characters. Over the ${MAX_TEXT_CHARS.toLocaleString()} limit.` : `${text.length.toLocaleString()} / ${MAX_TEXT_CHARS.toLocaleString()} characters`}</p>

      {notice && <div className="notice" role="status">{notice}</div>}

      <section className="results" aria-label="Results" aria-live="polite">
        {status === "loading" && <Skeleton label="Breaking the passage into pieces…" />}
        {status === "error" && error && <ErrorBox message={error.message} onRetry={error.retry ? () => run(text || analyzedText.current, source) : undefined} />}
        {status === "idle" && recent && <ReEntryCard session={recent} onWorkThrough={onWorkThrough} />}
        {status === "idle" && !recent && <p className="muted">Your results will show up here. Nothing on the page is changed.</p>}

        {status === "done" && analysis && (
          <>
            <p className="overview"><span className="sr-only">Overview: </span>{analysis.overview}</p>
            {analysis.chunks.map((c, n) => {
              const isOpen = open.has(c.id);
              const pop = openTerm?.chunkId === c.id ? openTerm.term : null;
              return (
                <article className="card" key={c.id}>
                  <h2 className="h2"><span className="badge" aria-hidden="true">{n + 1}</span>{c.heading}</h2>
                  <p className="takeaway"><RichText text={c.takeaway} terms={analysis.terms} bionic={bionic} activeTerm={pop?.term} onTerm={onTerm(c.id)} /></p>
                  <button type="button" className="link" aria-expanded={isOpen} aria-controls={`detail-${c.id}`} onClick={() => toggleChunk(c.id)}>
                    {isOpen ? "Hide detail" : "More detail"}
                  </button>
                  {isOpen && (
                    <p id={`detail-${c.id}`} className="details">
                      <RichText text={c.details} terms={analysis.terms} bionic={bionic} activeTerm={pop?.term} onTerm={onTerm(c.id)} />
                    </p>
                  )}
                  {pop && (
                    <TermPopover
                      term={pop}
                      pinned={pinnedFor(pop)}
                      onPin={() => update((l) => togglePin(l, pop.term, pop.analogy))}
                      onClose={closeTerm}
                    />
                  )}
                </article>
              );
            })}
            <ChatBox
              context={{ type: "text", passage: analyzedText.current, overview: analysis.overview }}
              label="Ask about this passage"
              placeholder='e.g. "explain this like a water pipe system"'
              onAsked={(q) => update((l) => {
                const s = l.sessions.find((x) => x.url === source.url);
                return s ? saveSession(l, { ...s, openQuestion: q, at: new Date().toISOString() }) : l;
              })}
            />
          </>
        )}
      </section>
    </div>
  );
}
