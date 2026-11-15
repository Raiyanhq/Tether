import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeImage, ApiError, extractText } from "../lib/api";
import { DEMO_DIAGRAM_SVG } from "../lib/demo";
import { prepareImage, svgToBlob, type PreparedImage } from "../lib/image";
import { imageFromClipboard } from "../lib/paste";
import type { ImageAnalysis } from "../lib/schemas";
import { ChatBox, type Suggestion } from "./components/ChatBox";
import { ErrorBox, Skeleton, useDialogFocus } from "./components/Common";
import { CloseIcon, ExpandIcon, StopIcon, UploadIcon } from "./components/Icons";

interface Props {
  active: boolean;
  /** Hand the image to Tutor Mode as the problem. */
  onTeach: (img: PreparedImage) => void;
  /** Hand the text found in the image to the Read tab. */
  onReadText: (text: string) => void;
}

type Status = "idle" | "loading" | "done" | "error" | "stopped";

// One tap instead of typing a question.
const SUGGESTIONS: Suggestion[] = [
  { label: "Step by step", question: "Explain this step by step." },
  { label: "Quiz me", question: "Quiz me with three short questions about this, one at a time." },
  { label: "Simpler", question: "Explain this more simply, with an everyday example." },
];

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Image, enlarged" tabIndex={-1} ref={ref} onKeyDown={onKeyDown} onClick={onClose}>
      <button type="button" className="btn icon round lightbox-close" aria-label="Close enlarged image" title="Close (Esc)" onClick={onClose}><CloseIcon /></button>
      <img src={src} alt="The image you added, enlarged" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

export function ImageTab({ active, onTeach, onReadText }: Props) {
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<ImageAnalysis | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const analyzeCtrl = useRef<AbortController | null>(null);
  const readCtrl = useRef<AbortController | null>(null);

  /** Cancel whatever is running. Safe to call any time. */
  const cancelAll = () => { analyzeCtrl.current?.abort(); readCtrl.current?.abort(); };

  const analyze = useCallback(async (p: PreparedImage) => {
    analyzeCtrl.current?.abort();
    const ctrl = new AbortController();
    analyzeCtrl.current = ctrl;
    setError(null); setNote(null); setResult(null); setStatus("loading");
    try {
      const r = await analyzeImage({ imageBase64: p.base64, mediaType: p.mediaType }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResult(r);
      setStatus("done");
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof ApiError && e.kind === "aborted")) { setStatus("stopped"); return; }
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not read that image.");
    }
  }, []);

  const load = useCallback(async (blob: Blob) => {
    cancelAll();
    setReading(false); setZoom(false);
    try {
      const p = await prepareImage(blob);
      setImg(p);
      await analyze(p);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not read that image.");
    }
  }, [analyze]);

  const stop = () => { analyzeCtrl.current?.abort(); };

  const remove = () => {
    cancelAll();
    setImg(null); setResult(null); setError(null); setNote(null);
    setReading(false); setZoom(false); setStatus("idle");
  };

  /** Pull the words out of the image and continue in the Read tab. */
  const readText = async () => {
    if (!img || reading) return;
    readCtrl.current?.abort();
    const ctrl = new AbortController();
    readCtrl.current = ctrl;
    setNote(null); setReading(true);
    try {
      const r = await extractText({ imageBase64: img.base64, mediaType: img.mediaType }, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (!r.text) { setNote(r.note || "I couldn't find readable text in that image."); return; }
      onReadText(r.text);
    } catch (e) {
      if (ctrl.signal.aborted || (e instanceof ApiError && e.kind === "aborted")) return;
      setNote(e instanceof Error ? e.message : "Could not read the text.");
    } finally {
      if (readCtrl.current === ctrl) setReading(false);
    }
  };

  // Ctrl/Cmd+V with an image on the clipboard.
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = imageFromClipboard(e);
      if (f) { e.preventDefault(); void load(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, load]);

  // Esc stops a running analysis or text read.
  useEffect(() => {
    if (!active || (status !== "loading" && !reading)) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !zoom) cancelAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, status, reading, zoom]);

  // Leaving the panel cancels in-flight work.
  useEffect(() => () => cancelAll(), []);

  return (
    <div>
      <div
        className={`drop${drag ? " over" : ""}${img ? " compact" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Add an image. Drop it here, paste it, or press Enter to choose a file."
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
      >
        <UploadIcon />
        <span>{img ? "Choose another image" : "Drop, paste or choose an image"}</span>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only-file" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
      {!img && (
        <p className="center-row">
          <button type="button" className="btn" aria-label="Try an example diagram" onClick={async () => void load(await svgToBlob(DEMO_DIAGRAM_SVG))}>Example</button>
        </p>
      )}

      {img && (
        <>
          <div className="preview-wrap">
            <button type="button" className="preview-btn" aria-label="Enlarge image" title="Tap to enlarge" onClick={() => setZoom(true)}>
              <img className="preview" src={img.dataUrl} alt="The image you added" />
            </button>
            <div className="preview-tools">
              <button type="button" className="btn icon round" aria-label="Enlarge image" title="Enlarge" onClick={() => setZoom(true)}><ExpandIcon /></button>
              <button type="button" className="btn icon round" aria-label="Remove image" title="Remove" onClick={remove}><CloseIcon /></button>
            </div>
          </div>

          <div className="actions" role="group" aria-label="What to do with this image">
            <button type="button" className="btn small" onClick={() => onTeach(img)}>Teach me this</button>
            {reading ? (
              <button type="button" className="btn small" onClick={() => readCtrl.current?.abort()}><StopIcon /> Stop reading</button>
            ) : (
              <button type="button" className="btn small" onClick={() => void readText()}>Read the text in it</button>
            )}
          </div>
          {note && <div className="notice" role="status">{note}</div>}
        </>
      )}

      {status === "loading" && (
        <>
          <Skeleton label="Looking at the image…" />
          <div className="center-row stop-row">
            <button type="button" className="btn small" aria-label="Stop analyzing" onClick={stop}><StopIcon /> Stop</button>
            <span className="muted small">or press Esc</span>
          </div>
        </>
      )}
      {status === "stopped" && img && (
        <div className="notice" role="status">
          <p>Stopped. Nothing was kept.</p>
          <div className="row"><button type="button" className="btn small primary" onClick={() => void analyze(img)}>Analyze again</button></div>
        </div>
      )}
      {status === "error" && error && <ErrorBox message={error} onRetry={img ? () => void analyze(img) : undefined} />}

      {status === "done" && result && img && (
        <>
          <section aria-label="Breakdown">
            <p className="overview">{result.summary}</p>
            {result.components.map((c, i) => (
              <article className="card" key={i} style={{ "--i": i } as React.CSSProperties}>
                <h2 className="h2">{c.label}</h2>
                <p className="takeaway">{c.explanation}</p>
              </article>
            ))}
          </section>
          <ChatBox
            key={img.base64.slice(-40)}
            context={{ type: "image", summary: result.summary, components: result.components, imageBase64: img.base64, mediaType: img.mediaType }}
            label="Ask about this image"
            suggestions={SUGGESTIONS}
          />
        </>
      )}

      {zoom && img && <Lightbox src={img.dataUrl} onClose={() => setZoom(false)} />}
    </div>
  );
}
