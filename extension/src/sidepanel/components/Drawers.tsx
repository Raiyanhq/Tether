import { useState } from "react";
import type { StruggleLog } from "../../lib/log";
import { glossary } from "../../lib/log";
import type { Prefs } from "../../lib/prefs";
import { TINTS, type ThemeId, type TintId } from "../../lib/tints";
import { useDialogFocus } from "./Common";
import { CloseIcon } from "./Icons";

function SheetHead({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="sheet-head">
      <h2 id={id} className="h2">{title}</h2>
      <button type="button" className="btn icon" title="Close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
    </div>
  );
}

export function GlossaryDrawer({ log, onClose }: { log: StruggleLog; onClose: () => void }) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const items = glossary(log);
  return (
    <div className="sheet" role="dialog" aria-modal="false" aria-labelledby="glossary-title" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <SheetHead id="glossary-title" title="My glossary" onClose={onClose} />
      {items.length === 0 ? (
        <p className="muted">Terms you open appear here.</p>
      ) : (
        <ul className="glossary">
          {items.map((t, i) => (
            <li key={t.term} style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
              <div className="g-head">
                <strong>{t.term}</strong>
                <span className="muted small">{t.lookups}×</span>
              </div>
              {t.definition && <p>{t.definition}</p>}
              {(t.pinnedAnalogy ?? t.analogy) && (
                <p className="muted">{t.pinnedAnalogy ? "Pinned: " : "Like: "}{t.pinnedAnalogy ?? t.analogy}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SettingsProps {
  prefs: Prefs;
  update: (p: Partial<Prefs>) => void;
  onClose: () => void;
  onClear: () => Promise<void>;
  /** Present only in demo builds. */
  onSeed?: () => void;
}

export function SettingsPopover({ prefs, update, onClose, onClear, onSeed }: SettingsProps) {
  const { ref, onKeyDown } = useDialogFocus(onClose);
  const [confirm, setConfirm] = useState(false);
  const themeLabel: Record<ThemeId, string> = { system: "Match my device", light: "Day", dark: "Night" };
  return (
    <div className="sheet" role="dialog" aria-labelledby="settings-title" tabIndex={-1} ref={ref} onKeyDown={onKeyDown}>
      <SheetHead id="settings-title" title="Reading preferences" onClose={onClose} />
      <p className="muted small">Personal preferences, not treatments.</p>

      <fieldset className="group">
        <legend className="eyebrow">Appearance</legend>
        <div className="choices">
          {(Object.keys(themeLabel) as ThemeId[]).map((id) => (
            <label key={id} className="radio">
              <input type="radio" name="theme" checked={prefs.theme === id} onChange={() => update({ theme: id })} />
              {themeLabel[id]}
            </label>
          ))}
        </div>
        <div className="choices">
          {(Object.keys(TINTS) as TintId[]).map((id) => (
            <label key={id} className="radio">
              <input type="radio" name="tint" checked={prefs.tint === id} onChange={() => update({ tint: id })} />
              {TINTS[id].label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend className="eyebrow">Text</legend>
        <label className="check">
          <input type="checkbox" checked={prefs.dyslexicFont} onChange={(e) => update({ dyslexicFont: e.target.checked })} />
          OpenDyslexic font
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs.bionic} onChange={(e) => update({ bionic: e.target.checked })} />
          Bionic reading (bold word starts)
        </label>
        <label className="slider">
          <span>Line height <b>{prefs.lineHeight.toFixed(1)}</b></span>
          <input type="range" min={1.4} max={2.2} step={0.1} value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} />
        </label>
        <label className="slider">
          <span>Letter spacing <b>{prefs.letterSpacing.toFixed(2)} em</b></span>
          <input type="range" min={0} max={0.2} step={0.01} value={prefs.letterSpacing} onChange={(e) => update({ letterSpacing: Number(e.target.value) })} />
        </label>
      </fieldset>

      <section className="group" aria-label="Your data">
        <h3 className="eyebrow">Your data</h3>
        <p className="muted small">Saved only on this device.</p>
        <div className="row">
          {confirm ? (
            <>
              <span>Erase everything?</span>
              <button type="button" className="btn danger small" onClick={() => void onClear().then(() => setConfirm(false))}>Yes, clear it</button>
              <button type="button" className="btn small" onClick={() => setConfirm(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="btn small" onClick={() => setConfirm(true)}>Clear my history</button>
              {onSeed && <button type="button" className="btn small" onClick={onSeed}>Load demo history</button>}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
