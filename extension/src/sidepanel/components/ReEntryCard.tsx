import type { SessionEntry } from "../../lib/log";
import { whenPhrase } from "../../lib/log";

interface Props { session: SessionEntry; onWorkThrough: (question: string, title: string) => void }

/** Replaces the blank empty state: where you stopped, what you had reached, what you were wondering. */
export function ReEntryCard({ session, onWorkThrough }: Props) {
  return (
    <section className="card reentry" aria-labelledby="reentry-title">
      <h2 id="reentry-title" className="h2">Pick up where you left off</h2>
      <p className="muted">{session.title} · {whenPhrase(session.at)}</p>
      <dl>
        <dt>You stopped at</dt>
        <dd>{session.lastHeading ?? session.lastChunkRead}</dd>
        {session.lastTakeaway && (<><dt>You had reached</dt><dd>{session.lastTakeaway}</dd></>)}
        {session.openQuestion && (<><dt>Your open question</dt><dd>“{session.openQuestion}”</dd></>)}
      </dl>
      <p className="next"><strong>One small next step:</strong>{" "}
        {session.openQuestion ? "get that question answered." : "highlight the next section on that page and send it to Tether."}
      </p>
      {session.openQuestion && (
        <button type="button" className="btn primary" onClick={() => onWorkThrough(session.openQuestion, session.title)}>
          Work through it in Tutor Mode
        </button>
      )}
    </section>
  );
}
