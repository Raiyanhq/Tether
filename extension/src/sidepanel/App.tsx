import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { DEV_TOOLS, IS_BUBBLE } from "../lib/config";
import { buildSeedLog } from "../lib/seed";
import { onItemChange, getItem, removeItem } from "../lib/storage";
import { GlossaryDrawer, SettingsPopover } from "./components/Drawers";
import { useLog, usePrefs } from "./hooks";
import { BookIcon, CloseIcon, LogoMark, TextIcon } from "./components/Icons";
import { Skeleton } from "./components/Common";
import { ReadTab, type Incoming } from "./ReadTab";
// Tutor (notepad + KaTeX) and Image load on first visit, so the bubble opens fast on the Read tab.
const TutorTab = lazy(() => import("./TutorTab").then((m) => ({ default: m.TutorTab })));
const ImageTab = lazy(() => import("./ImageTab").then((m) => ({ default: m.ImageTab })));

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
  const [hidden, setHidden] = useState(false); // bubble is closed: keep state, silence the tutor
  const mainRef = useRef<HTMLElement>(null);
  const [visited, setVisited] = useState<Set<Tab>>(new Set(["read"]));
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

  // The bubble's host page tells us when it is shown or hidden; closing is requested the same way.
  const closeBubble = () => window.parent.postMessage({ type: "tether:close" }, "*");
  useEffect(() => {
    if (!IS_BUBBLE) return;
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      if (e.data?.type === "tether:hidden") setHidden(true);
      else if (e.data?.type === "tether:shown") setHidden(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector(".sheet, .popover")) return; // those close themselves first
      closeBubble();
    };
    window.addEventListener("message", onMsg);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("message", onMsg); window.removeEventListener("keydown", onKey); };
  }, []);

  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const next = TABS[(n + TABS.length) % TABS.length].id;
    pick(next);
    tabRefs.current[next]?.focus();
  };

  const workThrough = (question: string, title: string) => {
    setSeedProblem({ text: `${question} (from: ${title})`, nonce: Date.now() });
    pick("tutor");
  };

  const pick = (t: Tab) => { mainRef.current?.scrollTo({ top: 0 }); setTab(t); setVisited((v) => (v.has(t) ? v : new Set(v).add(t))); };

  return (
    <div className="app">
      <header className="header">
        <h1 className="brand"><LogoMark />Tether</h1>
        <div className="header-actions">
          <button type="button" className="btn icon" title="Glossary" aria-label="Glossary" aria-haspopup="dialog" aria-expanded={drawer === "glossary"} onClick={() => setDrawer(drawer === "glossary" ? null : "glossary")}><BookIcon /></button>
          <button type="button" className="btn icon" title="Reading preferences" aria-label="Reading preferences" aria-haspopup="dialog" aria-expanded={drawer === "settings"} onClick={() => setDrawer(drawer === "settings" ? null : "settings")}><TextIcon /></button>
          {IS_BUBBLE && <button type="button" className="btn icon" title="Close" aria-label="Close Tether" onClick={closeBubble}><CloseIcon /></button>}
        </div>
      </header>


      <div className="tabs" role="tablist" aria-label="Tether modes" onKeyDown={onTabKey} style={{ "--i": TABS.findIndex((t) => t.id === tab) } as React.CSSProperties}>
        <span className="tab-ind" aria-hidden="true" />
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
            onClick={() => pick(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="stage">
      <main ref={mainRef}>
        <div className="tabpanel" role="tabpanel" id="panel-read" aria-labelledby="tab-read" hidden={tab !== "read"}>
          <ReadTab log={log} update={update} getLog={get} bionic={prefs.bionic} incoming={incoming} active={tab === "read" && !hidden} onWorkThrough={workThrough} />
        </div>
        <div className="tabpanel" role="tabpanel" id="panel-tutor" aria-labelledby="tab-tutor" hidden={tab !== "tutor"}>
          {visited.has("tutor") && (
            <Suspense fallback={<Skeleton label="Loading Tutor…" />}>
              <TutorTab log={log} update={update} getLog={get} prefs={prefs} updatePrefs={updatePrefs} active={tab === "tutor" && !hidden} seedProblem={seedProblem} />
            </Suspense>
          )}
        </div>
        <div className="tabpanel" role="tabpanel" id="panel-image" aria-labelledby="tab-image" hidden={tab !== "image"}>
          {visited.has("image") && (
            <Suspense fallback={<Skeleton label="Loading Image…" />}>
              <ImageTab active={tab === "image" && !hidden} />
            </Suspense>
          )}
        </div>
      </main>
      {drawer === "glossary" && <GlossaryDrawer log={log} onClose={() => setDrawer(null)} />}
      {drawer === "settings" && <SettingsPopover prefs={prefs} update={updatePrefs} onClose={() => setDrawer(null)} onClear={clear} onSeed={DEV_TOOLS ? () => update(() => buildSeedLog()) : undefined} />}
      </div>
    </div>
  );
}
