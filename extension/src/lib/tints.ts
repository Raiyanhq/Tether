// Reading tints. Defined in TS (not just CSS) so a unit test can verify contrast for every preset,
// including text sitting on translucent "glass" over the tint's background colours.
export type TintId = "default" | "cream" | "slate";
export interface Tint {
  label: string;
  /** Page background gradient endpoints, plus three soft colour blobs that make the glass blur visible. */
  bgA: string; bgB: string; blobs: [string, string, string];
  /** Base colour of glass surfaces. Used at GLASS_ALPHA (cards) and GLASS_STRONG_ALPHA (popovers, drawers). */
  glass: string;
  text: string; muted: string;
  accent: string; accentText: string; border: string; focus: string; mark: string; danger: string;
}

// Anything that carries text sits on at least this opaque a layer, so contrast stays predictable.
export const GLASS_ALPHA = 0.72;
export const GLASS_STRONG_ALPHA = 0.88;

export const TINTS: Record<TintId, Tint> = {
  default: { label: "Default", bgA: "#e6eeff", bgB: "#efe6ff", blobs: ["#b9ccff", "#d9c2ff", "#bfeedd"], glass: "#ffffff", text: "#1b2430", muted: "#46546a", accent: "#2650b8", accentText: "#ffffff", border: "#7d8aa0", focus: "#12338a", mark: "#fff0a8", danger: "#8f1d1d" },
  cream:   { label: "Warm Cream", bgA: "#f8f1de", bgB: "#f6e2d3", blobs: ["#f6d9a6", "#f2c6b4", "#e6e2b4"], glass: "#fffaf0", text: "#2b2415", muted: "#54472b", accent: "#8a4208", accentText: "#ffffff", border: "#8c7f5e", focus: "#5c2c00", mark: "#f6dc8a", danger: "#8f1d1d" },
  slate:   { label: "Muted Slate", bgA: "#d9e0ea", bgB: "#d3d6e8", blobs: ["#aebfd8", "#bdb6dc", "#a9cfd0"], glass: "#f4f7fb", text: "#16202a", muted: "#37465a", accent: "#1d4a86", accentText: "#ffffff", border: "#5d6e82", focus: "#0f2f5e", mark: "#f1e08c", danger: "#8f1d1d" },
};
