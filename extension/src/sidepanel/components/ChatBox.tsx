import { useState } from "react";
import type { ChatContext } from "../../lib/api";
import { useChat } from "../hooks";
import { SendIcon } from "./Icons";

interface Props {
  context: ChatContext;
  /** Doubles as the accessible label and the placeholder, e.g. "Ask about this passage". */
  label: string;
  onAsked?: (question: string) => void;
}

export function ChatBox({ context, label, onAsked }: Props) {
  const { messages, busy, error, ask } = useChat();
  const [q, setQ] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text || busy) return;
    setQ("");
    onAsked?.(text);
    void ask(text, context);
  };
  return (
    <section className="chat" aria-label={label}>
      <div aria-live="polite" className="chat-log">
        {messages.map((m) => (
          <p key={m.id} className={`msg ${m.role}`}>
            <span className="sr-only">{m.role === "user" ? "You: " : "Tether: "}</span>
            {m.content || (busy ? "Thinking…" : "")}
          </p>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit} className="askbar">
        <label className="sr-only" htmlFor={`chat-${label}`}>{label}</label>
        <input id={`chat-${label}`} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={label} autoComplete="off" />
        <button type="submit" className="btn icon round primary" aria-label="Ask" title="Ask" disabled={busy || !q.trim()}><SendIcon /></button>
      </form>
    </section>
  );
}
