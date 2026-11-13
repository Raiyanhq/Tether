import { useEffect, useLayoutEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { Step } from "../lib/schemas";

interface Props {
  steps: Step[];        // only the revealed steps
  activeIndex: number;
  reducedMotion: boolean;
  handwriting: boolean; // pen-and-paper style with an animated pen
  problem?: string;     // written at the top, like a teacher copying the question
  problemImage?: string | null;
  onSelectStep: (index: number) => void;
  onPadClick: () => void; // any click on the notepad barges in
}

interface Line { x1: number; y1: number; x2: number; y2: number; key: string }

/** How long the pen takes to write a step's visual: roughly handwriting speed, kept short so it never lags the voice. */
export function writeMsFor(s: Step): number {
  return Math.min(4500, Math.max(600, s.visual.content.length * 55));
}

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

function Pen() {
  return (
    <svg className="pen" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M3 21l3.5-1 12-12-2.5-2.5-12 12L3 21z" fill="currentColor" />
      <path d="M17.5 5l1.5-1.5 2.5 2.5L20 7.5z" fill="var(--accent)" />
    </svg>
  );
}

/** Writes text one character at a time with the pen riding the end of the line. */
function InkText({ text, ms, animate }: { text: string; ms: number; animate: boolean }) {
  const [anim] = useState(animate); // decided once, when it first appears; later re-renders must not cut it short
  const [n, setN] = useState(anim ? 0 : text.length);
  useEffect(() => {
    if (!anim) { setN(text.length); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / ms);
      setN(Math.floor(f * text.length));
      if (f < 1) raf = requestAnimationFrame(tick); else setN(text.length);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms, anim]);
  return (
    <span className="ink">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, n)}
        {n < text.length && <Pen />}
        <span className="ghost">{text.slice(n)}</span>
      </span>
    </span>
  );
}

function Tex({ tex }: { tex: string }) {
  let html: string;
  try { html = katex.renderToString(tex, { throwOnError: false, displayMode: false }); }
  catch { html = ""; }
  if (!html) return <span>{tex}</span>;
  return <span className="math" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** A slightly wobbly rectangle, sized to its content, that draws itself. */
function SketchBox() {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 120, h: 40 });
  useLayoutEffect(() => {
    const el = ref.current?.parentElement;
    if (el) setSize({ w: el.offsetWidth, h: el.offsetHeight });
  }, []);
  const { w, h } = size, r = 9;
  const d = `M${r},3 Q${w / 2},0 ${w - r},3.5 Q${w - 1},${h / 2} ${w - 3},${h - r} Q${w / 2},${h + 1} ${r + 2},${h - 3} Q1.5,${h / 2} 3,${r} Q3.5,3 ${r + 6},2.5`;
  return (
    <svg ref={ref} className="sketch" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path pathLength={1} d={d} />
    </svg>
  );
}

interface VisualProps { step: Step; hand: boolean; animate: boolean }

function Visual({ step, hand, animate: animateNow }: VisualProps) {
  const [animate] = useState(animateNow); // latch: see InkText
  const { kind, content } = step.visual;
  const ms = writeMsFor(step);
  const text = (t: string) => (hand ? <InkText text={t} ms={ms} animate={animate} /> : t);
  if (kind === "math") {
    return (
      <span className="wipe-wrap" style={{ "--write-ms": `${ms}ms` } as React.CSSProperties}>
        <span className={hand && animate ? "wipe" : ""}><Tex tex={content} /></span>
        {hand && animate && <span className="wipe-pen" aria-hidden="true"><Pen /></span>}
      </span>
    );
  }
  if (kind === "box") {
    return (
      <span className={`pad-box${hand ? " sketchy" : ""}${hand && animate ? " drawing" : ""}`}>
        {hand && <SketchBox />}
        {text(content)}
      </span>
    );
  }
  if (kind === "text") return <span>{text(content)}</span>;
  if (kind === "arrow") return <span className="pad-arrow-label">{text(`↳ ${content || "see earlier step"}`)}</span>;
  if (kind === "highlight") return <span className="muted">Look back at the highlighted part{content ? `: ${content}` : ""}</span>;
  return <span className="muted">{step.topic ?? "Just listening"}</span>;
}

export function Notepad({ steps, activeIndex, reducedMotion, handwriting, problem, problemImage, onSelectStep, onPadClick }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  // Each piece of writing animates once. Going back to a step shows it already written.
  const written = useRef(new Set<string>());
  const hand = handwriting;
  const canAnimate = hand && !reducedMotion;

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

  const keyOf = (s: Step) => `${s.id}:${hash(s.visual.kind + s.visual.content)}`;
  const animating = new Set(steps.filter((s) => canAnimate && !written.current.has(keyOf(s))).map(keyOf));
  const probKey = "problem:" + hash(problem ?? "");
  const animateProblem = canAnimate && !written.current.has(probKey);
  useEffect(() => {
    steps.forEach((s) => written.current.add(keyOf(s)));
    written.current.add(probKey);
  });

  const marked = new Set<string>();
  const pulsing = new Set<string>();
  steps.forEach((s, i) => {
    if (s.visual.kind !== "highlight") return;
    s.visual.refs.forEach((r) => { marked.add(r); if (i === activeIndex) pulsing.add(r); });
  });

  return (
    <div className={`pad${hand ? " hand" : ""}`} ref={wrap} onClick={onPadClick} role="list" aria-label="Notepad">
      {(problem || problemImage) && (
        <div role="listitem" className="pad-problem">
          <span className="pad-problem-label">Problem</span>
          {problem && <p className="pad-problem-text">{hand ? <InkText text={problem} ms={Math.min(3500, Math.max(500, problem.length * 35))} animate={animateProblem} /> : problem}</p>}
          {problemImage && <img src={problemImage} alt="The problem you attached" />}
        </div>
      )}
      {steps.map((s, i) => {
        const k = keyOf(s);
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
              <span className="pad-body"><Visual key={k} step={s} hand={hand} animate={animating.has(k)} /></span>
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
          return <path key={l.key} className={reducedMotion ? "" : "draw"} d={`M${l.x1},${l.y1} C${l.x1 + bend},${l.y1 - 4} ${l.x2 + bend},${l.y2 + 4} ${l.x2},${l.y2}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#head)" />;
        })}
      </svg>
    </div>
  );
}
