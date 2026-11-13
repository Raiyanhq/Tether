import type { Term } from "../../lib/schemas";
import { useDialogFocus } from "./Common";
import { CheckIcon, CloseIcon, PinIcon } from "./Icons";

interface Props { term: Term; pinned: boolean; onPin: () => void; onClose: () => void }

export function TermPopover({ term, pinned, onPin, onClose }: Props) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  return (
    <div className="popover" role="dialog" aria-label={`About ${term.term}`} tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <div className="sheet-head">
        <h3>{term.term}</h3>
        <button type="button" className="btn icon small" title="Close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      </div>
      <dl>
        <dt>Means</dt><dd>{term.definition}</dd>
        <dt>Like</dt><dd>{term.analogy}</dd>
        <dt>Here</dt><dd>{term.whyItMatters}</dd>
      </dl>
      <button type="button" className={`btn pin${pinned ? " on" : ""}`} aria-pressed={pinned} onClick={onPin}>
        {pinned ? <CheckIcon /> : <PinIcon />}
        {pinned ? "Analogy pinned" : "This analogy helps"}
      </button>
    </div>
  );
}
