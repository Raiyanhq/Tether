import { useEffect, useRef, type ReactNode } from "react";

export function ErrorBox({ message, onRetry, extra }: { message: string; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      <div className="row">
        {onRetry && <button type="button" className="btn" onClick={onRetry}>Try again</button>}
        {extra}
      </div>
    </div>
  );
}

export function Skeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <div className="card skeleton" key={i} aria-hidden="true">
          <div className="sk sk-h" /><div className="sk" /><div className="sk sk-s" />
        </div>
      ))}
    </div>
  );
}

/** Closes on Escape and returns focus to where it came from. For drawers and popovers. */
export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const from = useRef<Element | null>(null);
  useEffect(() => {
    from.current = document.activeElement;
    ref.current?.focus();
    return () => { if (from.current instanceof HTMLElement && document.contains(from.current)) from.current.focus(); };
  }, []);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); }
  };
  return { ref, onKeyDown };
}
