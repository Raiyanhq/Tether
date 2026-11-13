import { useEffect, useRef, useState } from "react";
import { DEV_TOOLS } from "../lib/config";
import { buildSeedLog } from "../lib/seed";
import { onItemChange, getItem, removeItem } from "../lib/storage";
import { GlossaryDrawer, SettingsPopover } from "./components/Drawers";
import { useLog, usePrefs } from "./hooks";
import { ImageTab } from "./ImageTab";
import { ReadTab, type Incoming } from "./ReadTab";
import { TutorTab } from "./TutorTab";

type Tab = "read" | "tutor" | "image";
const TABS: { id: Tab; label: string }[] = [
  { id: "read", label: "Read" },
  { id: "tutor", label: "Tutor" },
  { id: "image", label: "Image" },
];

interface Pending { kind: "text" | "pdf"; text?: string; url?: string; title?: string; at: number }

export function App() {
  const { log, update, clear, get } = useLog();
  const { prefs, update: updatePrefs } = usePrefs();
  const [tab, setTab] = useState<Tab>("read");
  const [drawer, setDrawer] = useState<"glossary" | "settings" | null>(null);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [seedProblem, setSeedProblem] = useState<{ text: string; nonce: number } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ read: null, tutor: null, image: null });

  // Text sent from the right-click menu arrives through session storage.
  useEffect(() => {
    const take = (p: Pending | undefined) => {
      if (!p || Date.now() - p.at > 60_000) return;
      setTab("read");
      setIncoming({ nonce: p.at, kind: p.kind, text: p.text, url: p.url, title: p.title });
      void removeItem("session", "pendingSelection");
    };
    void getItem<Pending | undefined>("session", "pendingSelection", undefined).then(take);
    return onItemChange<Pending>("session", "pendingSelection", take);
  }, []);

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const next = TABS[(n + TABS.length) % TABS.length].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const workThrough = (question: string, title: string) => {
    setSeedProblem({ text: `${question} (from: ${title})`, nonce: Date.now() });
    setTab("tutor");
  };

  const doClear = async () => { await clear(); setConfirmClear(false); };

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand">
          <svg width="30" height="30" viewBox="0 0 128 128" aria-hidden="true">
            <rect width="128" height="128" rx="30" fill="var(--accent)" />
            <circle cx="38" cy="64" r="14" fill="none" stroke="#fff" strokeWidth="9" />
            <circle cx="90" cy="64" r="14" fill="none" stroke="#fff" strokeWidth="9" />
            <path d="M52 64 H76" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
          </svg>
          Tether
        </h1>
        <div className="header-actions">
          <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={drawer === "glossary"} onClick={() => setDrawer(drawer === "glossary" ? null : "glossary")}>Glossary</button>
          <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={drawer === "settings"} onClick={() => setDrawer(drawer === "settings" ? null : "settings")}>Reading</button>
        </div>
      </header>

      <div className="privacy" role="group" aria-label="Your history">
        {confirmClear ? (
          <>
            <span>Erase everything Tether remembers?</span>
            <button type="button" className="btn danger small" onClick={() => void doClear()}>Yes, clear it</button>
            <button type="button" className="btn small" onClick={() => setConfirmClear(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span className="muted small">Your history stays on this device.</span>
            <button type="button" className="btn small" onClick={() => setConfirmClear(true)}>Clear my history</button>
            {DEV_TOOLS && (
              <button type="button" className="btn small" onClick={() => update(() => buildSeedLog())}>Load demo history</button>
            )}
          </>
        )}
      </div>

      {drawer === "glossary" && <GlossaryDrawer log={log} onClose={() => setDrawer(null)} />}
      {drawer === "settings" && <SettingsPopover prefs={prefs} update={updatePrefs} onClose={() => setDrawer(null)} />}

      <div className="tabs" role="tablist" aria-label="Tether modes" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "tab on" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main>
        <div role="tabpanel" id="panel-read" aria-labelledby="tab-read" hidden={tab !== "read"}>
          <ReadTab log={log} update={update} getLog={get} bionic={prefs.bionic} incoming={incoming} onWorkThrough={workThrough} />
        </div>
        <div role="tabpanel" id="panel-tutor" aria-labelledby="tab-tutor" hidden={tab !== "tutor"}>
          <TutorTab log={log} update={update} getLog={get} prefs={prefs} updatePrefs={updatePrefs} active={tab === "tutor"} seedProblem={seedProblem} />
        </div>
        <div role="tabpanel" id="panel-image" aria-labelledby="tab-image" hidden={tab !== "image"}>
          <ImageTab active={tab === "image"} />
        </div>
      </main>
    </div>
  );
}
