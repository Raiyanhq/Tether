import { useLayoutEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Step } from "../lib/schemas";

interface Props {
  steps: Step[];        // only the revealed steps
  activeIndex: number;
  reducedMotion: boolean;
  onSelectStep: (index: number) => void;
  onPadClick: () => void; // any click on the notepad barges in
}

interface Line { x1: number; y1: number; x2: number; y2: number; key: string }

function Tex({ tex }: { tex: string }) {
  let html: string;
  try { html = katex.renderToString(tex, { throwOnError: false, displayMode: false }); }
  catch { html = ""; }
  if (!html) return <span>{tex}</span>;
  return <span className="math" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Visual({ step }: { step: Step }) {
  const { kind, content } = step.visual;
  if (kind === "math") return <Tex tex={content} />;
  if (kind === "box") return <div className="pad-box">{content}</div>;
  if (kind === "text") return <span>{content}</span>;
  if (kind === "arrow") return <span className="pad-arrow-label">↳ {content || "see earlier step"}</span>;
  if (kind === "highlight") return <span className="muted">Look back at the highlighted part{content ? `: ${content}` : ""}</span>;
  return <span className="muted">{step.topic ?? "Just listening"}</span>;
}

export function Notepad({ steps, activeIndex, reducedMotion, onSelectStep, onPadClick }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);

  // Arrows are drawn from the referenced step's element to the arrow step's element.
  useLayoutEffect(() => {
    const root = wrap.current;
    if (!root) return;
    const next: Line[] = [];
    steps.forEach((s) => {
      if (s.visual.kind !== "arrow") return;
      const to = root.querySelector<HTMLElement>(`[data-step="${s.id}"]`);
      for (const ref of s.visual.refs) {
        const from = root.querySelector<HTMLElement>(`[data-step="${ref}"]`);
        if (!from || !to) continue;
        next.push({
          key: `${ref}->${s.id}`,
          x1: from.offsetLeft + from.offsetWidth,
          y1: from.offsetTop + from.offsetHeight / 2,
          x2: to.offsetLeft + to.offsetWidth,
          y2: to.offsetTop + to.offsetHeight / 2,
        });
      }
    });
    setLines(next);
  }, [steps, activeIndex]);

  useLayoutEffect(() => {
    // Keep the active step in view.
    wrap.current?.querySelector<HTMLElement>(".pad-item.active")?.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [activeIndex, steps.length, reducedMotion]);

  const marked = new Set<string>();
  const pulsing = new Set<string>();
  steps.forEach((s, i) => {
    if (s.visual.kind !== "highlight") return;
    s.visual.refs.forEach((r) => { marked.add(r); if (i === activeIndex) pulsing.add(r); });
  });

  return (
    <div className="pad" ref={wrap} onClick={onPadClick} role="list" aria-label="Notepad">
      {steps.map((s, i) => {
        const cls = ["pad-item", i === activeIndex ? "active" : "past", `kind-${s.visual.kind}`, marked.has(s.id) ? "marked" : "", pulsing.has(s.id) && !reducedMotion ? "pulse" : ""].join(" ");
        return (
          <div role="listitem" key={s.id}>
            <button
              type="button"
              className={cls}
              data-step={s.id}
              aria-current={i === activeIndex ? "step" : undefined}
              aria-label={`Step ${i + 1}. Ask about this step.`}
              onClick={(e) => { e.stopPropagation(); onSelectStep(i); }}
            >
              <span className="pad-num" aria-hidden="true">{i + 1}</span>
              <span className="pad-body"><Visual step={s} /></span>
            </button>
          </div>
        );
      })}
      <svg className="pad-svg" aria-hidden="true">
        <defs>
          <marker id="head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="currentColor" /></marker>
        </defs>
        {lines.map((l) => {
          const bend = 28;
          return <path key={l.key} className={reducedMotion ? "" : "draw"} d={`M${l.x1},${l.y1} C${l.x1 + bend},${l.y1} ${l.x2 + bend},${l.y2} ${l.x2},${l.y2}`} fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#head)" />;
        })}
      </svg>
    </div>
  );
}
