import { describe, it, expect } from "vitest";
import { addNotSure, emptyLog, glossary, knownTerms, pinnedAnalogies, recordLookup, saveSession, togglePin, topStruggles, whenPhrase } from "../src/lib/log";
import { buildSeedLog } from "../src/lib/seed";
import { SHEET_ALPHA, TINTS, paletteFor } from "../src/lib/tints";
import { blend, contrast } from "../src/lib/contrast";
import { applyPrefs, DEFAULT_PREFS } from "../src/lib/prefs";

describe("struggle log", () => {
  it("dedupes terms across pages and sorts by lookups", () => {
    let log = emptyLog();
    log = recordLookup(log, { term: "Amortized", url: "page2" });
    log = recordLookup(log, { term: "stack", url: "page2" });
    log = recordLookup(log, { term: "amortized", url: "page7" });
    const g = glossary(log);
    expect(g.map((t) => [t.term, t.lookups])).toEqual([["Amortized", 2], ["stack", 1]]);
    expect(g[0].sources).toEqual(["page2", "page7"]);
  });

  it("pins and unpins analogies, and passes pinned ones forward", () => {
    let log = recordLookup(emptyLog(), { term: "stack", url: "u", analogy: "plates" });
    log = togglePin(log, "stack", "plates");
    expect(pinnedAnalogies(log)).toEqual([{ term: "stack", analogy: "plates" }]);
    log = togglePin(log, "stack", "plates");
    expect(pinnedAnalogies(log)).toEqual([]);
  });

  it("keeps one session per url, newest first", () => {
    const s = (url: string) => ({ url, title: url, lastChunkRead: "c1", openQuestion: "", at: "" });
    let log = saveSession(emptyLog(), s("a"));
    log = saveSession(log, s("b"));
    log = saveSession(log, s("a"));
    expect(log.sessions.map((x) => x.url)).toEqual(["a", "b"]);
  });

  it("builds the visible 'starting from' line", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    let log = addNotSure(emptyLog(), { topic: "call stack", stepId: "s3", lessonTitle: "t", at: "2026-11-11T12:00:00Z" });
    log = addNotSure(log, { topic: "Call Stack", stepId: "s2", lessonTitle: "t2", at: "2026-11-09T12:00:00Z" });
    const s = topStruggles(log, now);
    expect(s.strugglingWith).toEqual(["call stack"]);
    expect(s.line).toBe('Starting from "call stack", since you flagged it twice this week.');
  });

  it("returns nothing for an empty log", () => {
    expect(topStruggles(emptyLog())).toEqual({ strugglingWith: [], line: null });
  });

  it("seed log drives the tutor line, glossary and pinned analogy", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const log = buildSeedLog(now);
    expect(log.terms.reduce((n, t) => n + t.lookups, 0)).toBe(12);
    expect(topStruggles(log, now).line).toContain('"call stack"');
    expect(topStruggles(log, now).strugglingWith.slice(0, 1)).toEqual(["call stack"]);
    expect(glossary(log)[0].lookups).toBe(3);
    expect(pinnedAnalogies(log)[0].term).toBe("amortized");
    expect(knownTerms(log)).toContain("hash table");
    expect(log.sessions[0].openQuestion).toBe("why does the base case matter");
  });

  it("phrases time", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(whenPhrase("2026-11-13T01:00:00Z", now)).toBe("today");
    expect(whenPhrase("2026-11-05T12:00:00Z", now)).toBe("last week");
  });
});

// Worst cases behind the glass: the page can be anything, so test black, white, grey and saturated colours.
const BACKDROPS = ["#000000", "#ffffff", "#808080", "#ff0000", "#0000ff", "#00ff00"];

describe("every tint, day and night, stays readable over any page behind the glass", () => {
  for (const [id, t] of Object.entries(TINTS)) {
    for (const mode of ["light", "dark"] as const) {
      const p = t[mode];
      const bare: string[] = [];   // short labels sit directly on the glass
      const dense: string[] = [];  // reading text sits on cards, inputs and sheets
      for (const b of BACKDROPS) {
        const g = blend(p.glass, p.glassAlpha, b);
        bare.push(g);
        dense.push(blend(p.surface, p.surfaceAlpha, g), blend(p.glass, SHEET_ALPHA, g));
      }
      const name = `${id} ${mode}`;
      it(`${name}: labels on bare glass >= 4.5, focus ring >= 3`, () => {
        for (const l of bare) {
          expect(contrast(p.text, l)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.focus, l)).toBeGreaterThanOrEqual(3);
        }
      });
      it(`${name}: reading text is AAA (>= 7) on cards and sheets, muted >= 4.5`, () => {
        for (const l of dense) {
          expect(contrast(p.text, l)).toBeGreaterThanOrEqual(7);
          expect(contrast(p.muted, l)).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrast(p.text, p.mark)).toBeGreaterThanOrEqual(7);
      });
      it(`${name}: accent, errors and the memory callout on cards and sheets`, () => {
        for (const l of dense) {
          expect(contrast(p.accent, l)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(p.danger, l)).toBeGreaterThanOrEqual(4.5);
          const callout = blend(p.accent, 0.08, l);
          expect(contrast(p.text, callout)).toBeGreaterThanOrEqual(7);
          expect(contrast(p.muted, callout)).toBeGreaterThanOrEqual(4.5);
        }
      });
      it(`${name}: button label >= 7, input borders and focus ring >= 3`, () => {
        expect(contrast(p.accentText, p.accent)).toBeGreaterThanOrEqual(7);
        for (const l of dense) {
          expect(contrast(p.border, l)).toBeGreaterThanOrEqual(3);
          expect(contrast(p.focus, l)).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});

describe("prefs", () => {
  const apply = (prefs: Parameters<typeof applyPrefs>[0], sysDark = false) => {
    const vars: Record<string, string> = {};
    const attrs: Record<string, string> = {};
    const root = { style: { setProperty: (k: string, v: string) => (vars[k] = v) }, setAttribute: (k: string, v: string) => (attrs[k] = v) } as unknown as HTMLElement;
    applyPrefs(prefs, root, sysDark);
    return { vars, attrs };
  };

  it("applies CSS variables", () => {
    const { vars, attrs } = apply({ ...DEFAULT_PREFS, tint: "cream", theme: "light", dyslexicFont: true, lineHeight: 1.9, letterSpacing: 0.05 });
    expect(vars["--accent"]).toBe(TINTS.cream.light.accent);
    expect(vars["--glass-rgb"]).toBe("251, 246, 234");
    expect(attrs["data-theme"]).toBe("light");
    expect(vars["--font"]).toContain("OpenDyslexic");
    expect(vars["--line-height"]).toBe("1.9");
    expect(vars["--letter-spacing"]).toBe("0.05em");
  });

  it("theme: system follows the device, light and dark override it", () => {
    expect(apply({ ...DEFAULT_PREFS, theme: "system" }, true).attrs["data-theme"]).toBe("dark");
    expect(apply({ ...DEFAULT_PREFS, theme: "system" }, false).attrs["data-theme"]).toBe("light");
    expect(apply({ ...DEFAULT_PREFS, theme: "light" }, true).attrs["data-theme"]).toBe("light");
    const dark = apply({ ...DEFAULT_PREFS, theme: "dark", tint: "slate" }, false);
    expect(dark.attrs["data-theme"]).toBe("dark");
    expect(dark.vars["--text"]).toBe(paletteFor("slate", true).text);
  });
});
