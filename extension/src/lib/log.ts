// The struggle log: Tether's memory. Lives in chrome.storage.local, leaves the device only as prompt context.
import { getItem, setItem, removeItem } from "./storage";

export interface TermEntry {
  term: string;
  lookups: number;
  lastSeen: string;
  sources: string[];
  pinnedAnalogy?: string;
  // Extras so the glossary still reads well on a later page.
  definition?: string;
  analogy?: string;
}
export interface NotSureEntry { topic: string; stepId: string; lessonTitle: string; at: string }
export interface SessionEntry {
  url: string;
  title: string;
  lastChunkRead: string;
  openQuestion: string;
  at: string;
  // Extras for the re-entry card.
  lastHeading?: string;
  lastTakeaway?: string;
}
export interface StruggleLog { terms: TermEntry[]; notSure: NotSureEntry[]; sessions: SessionEntry[] }

export const emptyLog = (): StruggleLog => ({ terms: [], notSure: [], sessions: [] });
const KEY = "struggleLog";
const MAX_SESSIONS = 20;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export async function loadLog(): Promise<StruggleLog> {
  const raw = await getItem<Partial<StruggleLog>>("local", KEY, {});
  return { ...emptyLog(), ...raw };
}
export const saveLog = (log: StruggleLog) => setItem("local", KEY, log);
export const clearLog = () => removeItem("local", KEY);

export function recordLookup(
  log: StruggleLog,
  p: { term: string; url: string; definition?: string; analogy?: string; now?: Date }
): StruggleLog {
  const at = (p.now ?? new Date()).toISOString();
  const existing = log.terms.find((t) => same(t.term, p.term));
  const terms = existing
    ? log.terms.map((t) =>
        t === existing
          ? {
              ...t,
              lookups: t.lookups + 1,
              lastSeen: at,
              sources: t.sources.includes(p.url) ? t.sources : [...t.sources, p.url],
              definition: p.definition ?? t.definition,
              analogy: p.analogy ?? t.analogy,
            }
          : t
      )
    : [...log.terms, { term: p.term, lookups: 1, lastSeen: at, sources: [p.url], definition: p.definition, analogy: p.analogy }];
  return { ...log, terms };
}

/** Thumbs-up on an analogy pins it; thumbs-up again unpins it. */
export function togglePin(log: StruggleLog, term: string, analogy: string): StruggleLog {
  const existing = log.terms.find((t) => same(t.term, term));
  if (!existing) {
    return { ...log, terms: [...log.terms, { term, lookups: 0, lastSeen: new Date().toISOString(), sources: [], pinnedAnalogy: analogy, analogy }] };
  }
  const pinned = existing.pinnedAnalogy === analogy ? undefined : analogy;
  return { ...log, terms: log.terms.map((t) => (t === existing ? { ...t, pinnedAnalogy: pinned } : t)) };
}

export function addNotSure(log: StruggleLog, e: Omit<NotSureEntry, "at"> & { at?: string }): StruggleLog {
  return { ...log, notSure: [...log.notSure, { ...e, at: e.at ?? new Date().toISOString() }] };
}

/** One session per url, newest first. */
export function saveSession(log: StruggleLog, s: SessionEntry): StruggleLog {
  const rest = log.sessions.filter((x) => x.url !== s.url);
  return { ...log, sessions: [s, ...rest].slice(0, MAX_SESSIONS) };
}

export const glossary = (log: StruggleLog) =>
  log.terms.filter((t) => t.lookups > 0).sort((a, b) => b.lookups - a.lookups || b.lastSeen.localeCompare(a.lastSeen));

export const pinnedAnalogies = (log: StruggleLog) =>
  log.terms.filter((t) => t.pinnedAnalogy).map((t) => ({ term: t.term, analogy: t.pinnedAnalogy! }));

export const knownTerms = (log: StruggleLog) => log.terms.filter((t) => t.lookups > 0).map((t) => t.term);

export const latestSession = (log: StruggleLog): SessionEntry | undefined => log.sessions[0];

const countWord = (n: number) => (n === 1 ? "once" : n === 2 ? "twice" : `${n} times`);

export function whenPhrase(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "this week";
  if (days <= 14) return "last week";
  return "a while ago";
}

export interface Struggles {
  strugglingWith: string[];
  /** The visible line shown in Tutor Mode. Null when the log has nothing relevant. */
  line: string | null;
}

/** Top "not sure" topics plus most looked-up terms become strugglingWith for /api/lesson. */
export function topStruggles(log: StruggleLog, now = new Date()): Struggles {
  const byTopic = new Map<string, { topic: string; count: number; last: string }>();
  for (const n of log.notSure) {
    const k = n.topic.trim().toLowerCase();
    const cur = byTopic.get(k);
    byTopic.set(k, { topic: cur?.topic ?? n.topic, count: (cur?.count ?? 0) + 1, last: cur && cur.last > n.at ? cur.last : n.at });
  }
  const flagged = [...byTopic.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 2);
  const taken = new Set(flagged.map((f) => f.topic.toLowerCase()));
  const looked = log.terms
    .filter((t) => t.lookups >= 2 && !taken.has(t.term.toLowerCase()))
    .sort((a, b) => b.lookups - a.lookups)
    .slice(0, 2);

  const strugglingWith = [...flagged.map((f) => f.topic), ...looked.map((t) => t.term)];
  let line: string | null = null;
  if (flagged[0]) {
    line = `Starting from "${flagged[0].topic}", since you flagged it ${countWord(flagged[0].count)} ${whenPhrase(flagged[0].last, now)}.`;
  } else if (looked[0]) {
    line = `Starting from "${looked[0].term}", since you looked it up ${looked[0].lookups} times.`;
  }
  return { strugglingWith, line };
}
