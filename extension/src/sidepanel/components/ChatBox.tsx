import { useState } from "react";
import type { ChatContext } from "../../lib/api";
import { useChat } from "../hooks";
import { SendIcon, StopIcon } from "./Icons";

export interface Suggestion { label: string; question: string }

interface Props {
  context: ChatContext;
  /** Doubles as the accessible label and the placeholder, e.g. "Ask about this passage". */
  label: string;
  onAsked?: (question: string) => void;
  /** One-tap questions, so there is less to type. */
  suggestions?: Suggestion[];
}

export function ChatBox({ context, label, onAsked, suggestions }: Props) {
  const { messages, busy, error, ask, stop } = useChat();
  const [q, setQ] = useState("");
  const send = (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    onAsked?.(t);
    void ask(t, context);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) { stop(); return; }
    const text = q;
    setQ("");
    send(text);
  };
  return (
    <section className="chat" aria-label={label}>
      <div aria-live="polite" className="chat-log">
        {messages.map((m) => (
          <p key={m.id} className={`msg ${m.role}`}>
            <span className="sr-only">{m.role === "user" ? "You: " : "Tether: "}</span>
            {m.content || (busy ? "Thinking…" : "")}
            {m.stopped && <span className="stopped-tag">Stopped</span>}
          </p>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {suggestions && !busy && (
        <div className="suggest" role="group" aria-label="Quick questions">
          {suggestions.map((s) => (
            <button key={s.label} type="button" className="btn small" onClick={() => send(s.question)}>{s.label}</button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="askbar">
        <label className="sr-only" htmlFor={`chat-${label}`}>{label}</label>
        <input
          id={`chat-${label}`} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} autoComplete="off"
          onKeyDown={(e) => { if (e.key === "Escape" && busy) { e.preventDefault(); e.stopPropagation(); stop(); } }}
        />
        {busy ? (
          <button type="submit" className="btn icon round stopbtn" aria-label="Stop answering" title="Stop (Esc)"><StopIcon /></button>
        ) : (
          <button type="submit" className="btn icon round primary" aria-label="Ask" title="Ask" disabled={!q.trim()}><SendIcon /></button>
        )}
      </form>
    </section>
  );
}
