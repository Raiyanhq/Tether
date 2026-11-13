import type { Term } from "../../lib/schemas";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bionic reading: bold the first part of each word. A reading preference, not a treatment. */
export function Bionic({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}]+)(.*)$/su.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const [, pre, word, post] = m;
        const n = Math.max(1, Math.ceil(word.length * 0.4));
        return (
          <span key={i}>
            {pre}<b className="bionic">{word.slice(0, n)}</b>{word.slice(n)}{post}
          </span>
        );
      })}
    </>
  );
}

interface Props {
  text: string;
  terms?: Term[];
  bionic: boolean;
  activeTerm?: string | null;
  onTerm?: (t: Term, el: HTMLElement) => void;
}

/** Plain text with jargon underlined as buttons. */
export function RichText({ text, terms = [], bionic, activeTerm, onTerm }: Props) {
  const render = (s: string) => (bionic ? <Bionic text={s} /> : s);
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  if (!sorted.length || !onTerm) return <>{render(text)}</>;

  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((t) => esc(t.term)).join("|")})(?![\\p{L}\\p{N}])`, "giu");
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(<span key={`t${last}`}>{render(text.slice(last, idx))}</span>);
    const term = sorted.find((t) => t.term.toLowerCase() === m[0].toLowerCase())!;
    out.push(
      <button
        key={`b${idx}`}
        type="button"
        className="term"
        data-term={term.term.toLowerCase()}
        aria-haspopup="dialog"
        aria-expanded={activeTerm === term.term}
        onClick={(e) => onTerm(term, e.currentTarget)}
      >
        {m[0]}
      </button>
    );
    last = idx + m[0].length;
  }
  if (last < text.length) out.push(<span key={`t${last}`}>{render(text.slice(last))}</span>);
  return <>{out}</>;
}
