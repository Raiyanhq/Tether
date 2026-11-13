import type { Term } from "../../lib/schemas";
import { useDialogFocus } from "./Common";

interface Props { term: Term; pinned: boolean; onPin: () => void; onClose: () => void }

export function TermPopover({ term, pinned, onPin, onClose }: Props) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  return (
    <div className="popover" role="dialog" aria-label={`About ${term.term}`} tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <h3>{term.term}</h3>
      <dl>
        <dt>What it means</dt><dd>{term.definition}</dd>
        <dt>Think of it like</dt><dd>{term.analogy}</dd>
        <dt>Why it matters here</dt><dd>{term.whyItMatters}</dd>
      </dl>
      <div className="row">
        <button type="button" className={`btn${pinned ? " on" : ""}`} aria-pressed={pinned} onClick={onPin}>
          <span aria-hidden="true">👍</span> {pinned ? "Analogy pinned" : "This analogy helps"}
        </button>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
