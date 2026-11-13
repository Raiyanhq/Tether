import { getItem, setItem } from "./storage";
import { TINTS, type TintId } from "./tints";

// Reading preferences (not treatments). Stored in chrome.storage.sync.
export interface Prefs {
  dyslexicFont: boolean;
  lineHeight: number;      // unitless, 1.4 - 2.2
  letterSpacing: number;   // em, 0 - 0.2
  tint: TintId;
  bionic: boolean;
  muteVoice: boolean;
  voiceRate: number;       // 0.8 - 1.2
}
export const DEFAULT_PREFS: Prefs = {
  dyslexicFont: false, lineHeight: 1.6, letterSpacing: 0, tint: "default", bionic: false, muteVoice: false, voiceRate: 1,
};
const KEY = "prefs";

export async function loadPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...(await getItem<Partial<Prefs>>("sync", KEY, {})) };
}
export const savePrefs = (p: Prefs) => setItem("sync", KEY, p);

/** Applied through CSS variables so changes are instant. */
export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement) {
  const t = TINTS[p.tint] ?? TINTS.default;
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--bg", t.bg); set("--surface", t.surface); set("--text", t.text); set("--muted", t.muted);
  set("--accent", t.accent); set("--accent-text", t.accentText); set("--border", t.border);
  set("--focus", t.focus); set("--mark", t.mark);
  set("--line-height", String(p.lineHeight));
  set("--letter-spacing", `${p.letterSpacing}em`);
  set("--font", p.dyslexicFont ? `"OpenDyslexic", system-ui, sans-serif` : `system-ui, -apple-system, "Segoe UI", sans-serif`);
}
