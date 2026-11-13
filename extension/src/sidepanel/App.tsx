import { useState } from "react";

export function App() {
  const [text, setText] = useState("");

  return (
    <div className="app">
      <header className="header">
        <h1>Tether</h1>
        <p className="tagline">Read it. Learn it. Pick up where you left off.</p>
      </header>

      <main>
        <label htmlFor="input" className="label">
          Paste a confusing passage
        </label>
        <textarea
          id="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Paste text here, or highlight text on a page."
        />
        <button className="primary" disabled={!text.trim()}>
          Break it down
        </button>

        <section aria-live="polite" className="results" aria-label="Results">
          <p className="muted">Your results will show up here.</p>
        </section>
      </main>
    </div>
  );
}
