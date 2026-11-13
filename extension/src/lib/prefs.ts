import { getItem, setItem } from "./storage";
import { hexToRgbTriplet } from "./contrast";
import { paletteFor, type ThemeId, type TintId } from "./tints";

// Reading preferences (not treatments). Stored in chrome.storage.sync.
export interface Prefs {
  dyslexicFont: boolean;
  lineHeight: number;      // unitless, 1.4 - 2.2
  letterSpacing: number;   // em, 0 - 0.2
  tint: TintId;
  theme: ThemeId;          // system follows the OS day/night setting
  bionic: boolean;
  muteVoice: boolean;
  voiceRate: number;       // 0.8 - 1.2
}
export const DEFAULT_PREFS: Prefs = {
  dyslexicFont: false, lineHeight: 1.6, letterSpacing: 0, tint: "default", theme: "system", bionic: false, muteVoice: false, voiceRate: 1,
};
const KEY = "prefs";

export async function loadPrefs(): Promise<Prefs> {
  return { ...DEFAULT_PREFS, ...(await getItem<Partial<Prefs>>("sync", KEY, {})) };
}
export const savePrefs = (p: Prefs) => setItem("sync", KEY, p);

const media = (q: string) => typeof matchMedia !== "undefined" && matchMedia(q).matches;
export const systemDark = () => media("(prefers-color-scheme: dark)");
export const resolveDark = (p: Prefs, sysDark = systemDark()) => (p.theme === "system" ? sysDark : p.theme === "dark");
/** People who ask for less transparency or more contrast get opaque surfaces. */
const wantsSolid = () => media("(prefers-reduced-transparency: reduce)") || media("(prefers-contrast: more)");

/** Applied through CSS variables so changes are instant. */
export function applyPrefs(p: Prefs, root: HTMLElement = document.documentElement, sysDark = systemDark()) {
  const dark = resolveDark(p, sysDark);
  const c = paletteFor(p.tint, dark);
  const set = (k: string, v: string) => root.style.setProperty(k, v);
  set("--glass-rgb", hexToRgbTriplet(c.glass));
  set("--glass-alpha", String(wantsSolid() ? 1 : c.glassAlpha));
  set("--surface-rgb", hexToRgbTriplet(c.surface)); set("--surface-alpha", String(c.surfaceAlpha));
  set("--text", c.text); set("--text-rgb", hexToRgbTriplet(c.text)); set("--muted", c.muted);
  set("--accent", c.accent); set("--accent-text", c.accentText); set("--border", c.border);
  set("--focus", c.focus); set("--mark", c.mark); set("--danger", c.danger);
  set("--line-height", String(p.lineHeight));
  set("--letter-spacing", `${p.letterSpacing}em`);
  set("--font", p.dyslexicFont ? `"OpenDyslexic", system-ui, sans-serif` : `system-ui, -apple-system, "Segoe UI", sans-serif`);
  root.setAttribute?.("data-theme", dark ? "dark" : "light");
}

/** What the page-side glass layer needs to match the app (the bubble blurs the host page, so it lives outside the iframe). */
export function glassMessage(p: Prefs, sysDark = systemDark()) {
  const dark = resolveDark(p, sysDark);
  const c = paletteFor(p.tint, dark);
  return { type: "tether:glass", rgb: hexToRgbTriplet(c.glass), alpha: wantsSolid() ? 1 : c.glassAlpha, dark };
}
