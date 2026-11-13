import { describe, it, expect } from "vitest";
import { addNotSure, emptyLog, glossary, knownTerms, pinnedAnalogies, recordLookup, saveSession, togglePin, topStruggles, whenPhrase } from "../src/lib/log";
import { buildSeedLog } from "../src/lib/seed";
import { TINTS } from "../src/lib/tints";
import { contrast } from "../src/lib/contrast";
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

describe("tints meet WCAG AA", () => {
  for (const [id, t] of Object.entries(TINTS)) {
    it(`${id}: text/muted on bg and surface >= 4.5`, () => {
      for (const bg of [t.bg, t.surface]) {
        expect(contrast(t.text, bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.muted, bg)).toBeGreaterThanOrEqual(4.5);
      }
    });
    it(`${id}: accent button, accent text and focus ring`, () => {
      expect(contrast(t.accentText, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.accent, t.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.text, t.mark)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.border, t.bg)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("prefs", () => {
  it("applies CSS variables", () => {
    const vars: Record<string, string> = {};
    const root = { style: { setProperty: (k: string, v: string) => (vars[k] = v) } } as unknown as HTMLElement;
    applyPrefs({ ...DEFAULT_PREFS, tint: "cream", dyslexicFont: true, lineHeight: 1.9, letterSpacing: 0.05 }, root);
    expect(vars["--bg"]).toBe(TINTS.cream.bg);
    expect(vars["--font"]).toContain("OpenDyslexic");
    expect(vars["--line-height"]).toBe("1.9");
    expect(vars["--letter-spacing"]).toBe("0.05em");
  });
});
