import type { StruggleLog } from "../../lib/log";
import { glossary } from "../../lib/log";
import type { Prefs } from "../../lib/prefs";
import { TINTS, type TintId } from "../../lib/tints";
import { useDialogFocus } from "./Common";

export function GlossaryDrawer({ log, onClose }: { log: StruggleLog; onClose: () => void }) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const items = glossary(log);
  return (
    <div className="drawer" role="dialog" aria-modal="false" aria-labelledby="glossary-title" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <div className="drawer-head">
        <h2 id="glossary-title" className="h2">My glossary</h2>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      {items.length === 0 ? (
        <p className="muted">Terms you open show up here and stay across pages.</p>
      ) : (
        <ul className="glossary">
          {items.map((t) => (
            <li key={t.term}>
              <div className="g-head">
                <strong>{t.term}</strong>
                <span className="muted">looked up {t.lookups}×</span>
              </div>
              {t.definition && <p>{t.definition}</p>}
              {(t.pinnedAnalogy ?? t.analogy) && (
                <p className="muted">{t.pinnedAnalogy ? "Pinned analogy: " : "Analogy: "}{t.pinnedAnalogy ?? t.analogy}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SettingsPopover({ prefs, update, onClose }: { prefs: Prefs; update: (p: Partial<Prefs>) => void; onClose: () => void }) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  return (
    <div className="drawer" role="dialog" aria-labelledby="settings-title" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <div className="drawer-head">
        <h2 id="settings-title" className="h2">Reading preferences</h2>
        <button type="button" className="btn" onClick={onClose}>Close</button>
      </div>
      <p className="muted">Choose what feels comfortable. These are preferences, and some people just like them better.</p>

      <label className="field check">
        <input type="checkbox" checked={prefs.dyslexicFont} onChange={(e) => update({ dyslexicFont: e.target.checked })} />
        OpenDyslexic font
      </label>
      <label className="field check">
        <input type="checkbox" checked={prefs.bionic} onChange={(e) => update({ bionic: e.target.checked })} />
        Bionic reading (bold word starts)
      </label>

      <label className="field">
        Line height: {prefs.lineHeight.toFixed(1)}
        <input type="range" min={1.4} max={2.2} step={0.1} value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} />
      </label>
      <label className="field">
        Letter spacing: {prefs.letterSpacing.toFixed(2)} em
        <input type="range" min={0} max={0.2} step={0.01} value={prefs.letterSpacing} onChange={(e) => update({ letterSpacing: Number(e.target.value) })} />
      </label>

      <fieldset className="field">
        <legend>Background tint</legend>
        <div className="row">
          {(Object.keys(TINTS) as TintId[]).map((id) => (
            <label key={id} className="radio">
              <input type="radio" name="tint" checked={prefs.tint === id} onChange={() => update({ tint: id })} />
              {TINTS[id].label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
