import seed from "../../../seed/struggle-log.seed.json";
import type { StruggleLog } from "./log";

const ago = (days: number, now: Date) => new Date(now.getTime() - days * 86_400_000).toISOString();

/** Turns the seed file (daysAgo offsets) into a real struggle log. Used by the dev-only "Load demo history" button. */
export function buildSeedLog(now = new Date()): StruggleLog {
  return {
    terms: seed.terms.map(({ daysAgo, ...t }) => ({ ...t, lastSeen: ago(daysAgo, now) })),
    notSure: seed.notSure.map(({ daysAgo, ...n }) => ({ ...n, at: ago(daysAgo, now) })),
    sessions: seed.sessions.map(({ daysAgo, ...s }) => ({ ...s, at: ago(daysAgo, now) })),
  };
}
