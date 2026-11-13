import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeImage } from "../lib/api";
import { DEMO_DIAGRAM_SVG } from "../lib/demo";
import { prepareImage, svgToBlob, type PreparedImage } from "../lib/image";
import type { ImageAnalysis } from "../lib/schemas";
import { ChatBox } from "./components/ChatBox";
import { ErrorBox, Skeleton } from "./components/Common";

export function ImageTab({ active }: { active: boolean }) {
  const [img, setImg] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<ImageAnalysis | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (blob: Blob) => {
    setError(null); setResult(null); setStatus("loading");
    try {
      const p = await prepareImage(blob);
      setImg(p);
      setResult(await analyzeImage({ imageBase64: p.base64, mediaType: p.mediaType }));
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Could not read that image.");
    }
  }, []);

  // Paste an image from the clipboard while this tab is showing.
  useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); void load(f); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [active, load]);

  return (
    <div>
      <div
        className={`drop${drag ? " over" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Add an image: drop it here, paste it, or press Enter to choose a file"
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
      >
        Drop a diagram or slide here, paste one (Ctrl/Cmd+V), or press Enter to pick a file.
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only-file" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ""; }} />
      <div className="row">
        <button type="button" className="btn" onClick={async () => void load(await svgToBlob(DEMO_DIAGRAM_SVG))}>Try an example diagram</button>
      </div>

      {img && <img className="preview" src={img.dataUrl} alt="The image you added" />}
      {status === "loading" && <Skeleton label="Looking at the image…" />}
      {status === "error" && error && <ErrorBox message={error} />}

      {status === "done" && result && img && (
        <>
          <section aria-label="Breakdown">
            <p className="overview">{result.summary}</p>
            {result.components.map((c, i) => (
              <article className="card" key={i}>
                <h2 className="h2">{c.label}</h2>
                <p>{c.explanation}</p>
              </article>
            ))}
          </section>
          <ChatBox
            context={{ type: "image", summary: result.summary, components: result.components, imageBase64: img.base64, mediaType: img.mediaType }}
            label="Ask about this image"
            placeholder='e.g. "what does arrow B mean?"'
          />
        </>
      )}
    </div>
  );
}
