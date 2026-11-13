import type { SessionEntry } from "../../lib/log";
import { whenPhrase } from "../../lib/log";

interface Props { session: SessionEntry; onWorkThrough: (question: string, title: string) => void }

/** The empty state: where you stopped and what you were wondering, with one next step. */
export function ReEntryCard({ session, onWorkThrough }: Props) {
  return (
    <section className="card reentry" aria-labelledby="reentry-title">
      <p className="eyebrow">{whenPhrase(session.at)}</p>
      <h2 id="reentry-title" className="h2">Continue</h2>
      <p className="muted">{session.title}</p>
      <dl>
        <dt>Stopped at</dt>
        <dd>{session.lastHeading ?? session.lastChunkRead}</dd>
        {session.openQuestion && (<><dt>Your question</dt><dd>“{session.openQuestion}”</dd></>)}
      </dl>
      {session.openQuestion ? (
        <button type="button" className="btn primary" onClick={() => onWorkThrough(session.openQuestion, session.title)}>
          Work on it in Tutor
        </button>
      ) : (
        <p className="muted small">Highlight the next section on that page to keep going.</p>
      )}
    </section>
  );
}
