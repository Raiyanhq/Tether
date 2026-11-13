// Reading tints x theme (light / dark). Defined in TS (not just CSS) so a unit test can verify contrast for every
// palette over any page colour.
//
// Readability model: the bubble is fairly transparent glass, so only short UI labels sit directly on it. All reading
// text (cards, narration, sheets, inputs) sits on a denser "surface" layer that keeps AAA contrast.
export type TintId = "default" | "cream" | "slate";
export type ThemeId = "system" | "light" | "dark";

export interface Palette {
  /** Glass base colour and its opacity. The bubble blurs the page behind it through this layer. */
  glass: string; glassAlpha: number;
  /** Cards, inputs and narration sit on the glass: a denser layer so reading text stays crisp. */
  surface: string; surfaceAlpha: number;
  text: string; muted: string;
  accent: string; accentText: string;
  border: string; focus: string; mark: string; danger: string;
}
export interface Tint { label: string; light: Palette; dark: Palette }

/** Sheets and popovers are nearly opaque glass so long text on them is always readable. */
export const SHEET_ALPHA = 0.94;

export const TINTS: Record<TintId, Tint> = {
  default: {
    label: "Default",
    light: { glass: "#f6f6f4", glassAlpha: 0.66, surface: "#ffffff", surfaceAlpha: 0.8, text: "#17181c", muted: "#4a4d57", accent: "#3b44c4", accentText: "#ffffff", border: "#6b6f7d", focus: "#2a2fa0", mark: "#ffe9a3", danger: "#a3151b" },
    dark:  { glass: "#0e1016", glassAlpha: 0.68, surface: "#0a0c10", surfaceAlpha: 0.55, text: "#f1f3f8", muted: "#b8bdcb", accent: "#aeb3ff", accentText: "#12143a", border: "#8c92a6", focus: "#c9ccff", mark: "#4a3f00", danger: "#ffa3a8" },
  },
  cream: {
    label: "Warm Cream",
    light: { glass: "#fbf6ea", glassAlpha: 0.66, surface: "#fffdf8", surfaceAlpha: 0.8, text: "#241c0e", muted: "#54482e", accent: "#8a4208", accentText: "#ffffff", border: "#7a6c4c", focus: "#5c2c00", mark: "#f6dc8a", danger: "#9c1a1a" },
    dark:  { glass: "#17120d", glassAlpha: 0.68, surface: "#0c0906", surfaceAlpha: 0.55, text: "#f6eedf", muted: "#d0c3a8", accent: "#f2b56b", accentText: "#2a1500", border: "#a29372", focus: "#ffd89a", mark: "#4f3b00", danger: "#ffa596" },
  },
  slate: {
    label: "Muted Slate",
    light: { glass: "#eef1f6", glassAlpha: 0.66, surface: "#ffffff", surfaceAlpha: 0.8, text: "#121b26", muted: "#34445a", accent: "#17457f", accentText: "#ffffff", border: "#5a6c82", focus: "#0c2f61", mark: "#f1e08c", danger: "#9b1c1c" },
    dark:  { glass: "#0c131d", glassAlpha: 0.68, surface: "#070b11", surfaceAlpha: 0.55, text: "#e9eff7", muted: "#b9c6d8", accent: "#97c2f4", accentText: "#08182c", border: "#8fa2ba", focus: "#b4d4f7", mark: "#463c00", danger: "#ffa0a0" },
  },
};

export const paletteFor = (tint: TintId, dark: boolean): Palette => (TINTS[tint] ?? TINTS.default)[dark ? "dark" : "light"];
