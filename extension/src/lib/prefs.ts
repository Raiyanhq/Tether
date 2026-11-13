import { getItem, setItem } from "./storage";
import { hexToRgbTriplet } from "./contrast";
import { GLASS_ALPHA, GLASS_STRONG_ALPHA, TINTS, type TintId } from "./tints";

// Reading preferences (not treatments). Stored in chrome.storage.sync.
export interface Prefs {
  dyslexicFont: boolean;
  lineHeight: number;      // unitless, 1.4 - 2.2
  letterSpacing: number;   // em, 0 - 0.2
  tint: TintId;
  bionic: boolean;
  muteVoice: boolean;
  voiceRate: number;       // 0.8 - 1.2
  voiceNatural: boolean;   // use the server's natural voice (ElevenLabs) when it is available
  handwriting: boolean;    // Tutor notepad: handwriting style with an animated pen
}
export const DEFAULT_PREFS: Prefs = {
  dyslexicFont: false, lineHeight: 1.6, letterSpacing: 0, tint: "default", bionic: false, muteVoice: false, voiceRate: 1, voiceNatural: true, handwriting: true,
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
  set("--bg", t.bgA); set("--bg-a", t.bgA); set("--bg-b", t.bgB);
  set("--blob-1", t.blobs[0]); set("--blob-2", t.blobs[1]); set("--blob-3", t.blobs[2]);
  set("--glass-rgb", hexToRgbTriplet(t.glass));
  set("--glass-alpha", String(GLASS_ALPHA)); set("--glass-strong-alpha", String(GLASS_STRONG_ALPHA));
  set("--text", t.text); set("--muted", t.muted); set("--danger", t.danger);
  set("--accent", t.accent); set("--accent-text", t.accentText); set("--border", t.border);
  set("--focus", t.focus); set("--mark", t.mark);
  set("--line-height", String(p.lineHeight));
  set("--letter-spacing", `${p.letterSpacing}em`);
  set("--font", p.dyslexicFont ? `"OpenDyslexic", system-ui, sans-serif` : `system-ui, -apple-system, "Segoe UI", sans-serif`);
}
