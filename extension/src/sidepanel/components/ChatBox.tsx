import { useState } from "react";
import type { ChatContext } from "../../lib/api";
import { useChat } from "../hooks";

interface Props {
  context: ChatContext;
  label: string;
  placeholder: string;
  onAsked?: (question: string) => void;
}

export function ChatBox({ context, label, placeholder, onAsked }: Props) {
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
      <h2 className="h2">{label}</h2>
      <div aria-live="polite" className="chat-log">
        {messages.map((m) => (
          <p key={m.id} className={`msg ${m.role}`}>
            <span className="sr-only">{m.role === "user" ? "You: " : "Tether: "}</span>
            {m.content || (busy ? "Thinking…" : "")}
          </p>
        ))}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <form onSubmit={submit} className="row">
        <label className="sr-only" htmlFor={`chat-${label}`}>{label}</label>
        <input id={`chat-${label}`} type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="btn primary" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </section>
  );
}
