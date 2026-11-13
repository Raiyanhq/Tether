// Reading tints. Defined in TS (not just CSS) so a unit test can verify contrast for every preset.
export type TintId = "default" | "cream" | "slate";
export interface Tint {
  label: string;
  bg: string; surface: string; text: string; muted: string;
  accent: string; accentText: string; border: string; focus: string; mark: string;
}
export const TINTS: Record<TintId, Tint> = {
  default: { label: "Default", bg: "#ffffff", surface: "#f3f5f8", text: "#1f2933", muted: "#4a5866", accent: "#2650b8", accentText: "#ffffff", border: "#8a96a3", focus: "#12338a", mark: "#fff3b0" },
  cream:   { label: "Warm Cream", bg: "#f8f1de", surface: "#efe5c8", text: "#2b2415", muted: "#54472b", accent: "#8a4208", accentText: "#ffffff", border: "#8c7f5e", focus: "#5c2c00", mark: "#f6dc8a" },
  slate:   { label: "Muted Slate", bg: "#dde3ea", surface: "#cfd8e2", text: "#16202a", muted: "#37465a", accent: "#1d4a86", accentText: "#ffffff", border: "#5d6e82", focus: "#0f2f5e", mark: "#f1e08c" },
};
