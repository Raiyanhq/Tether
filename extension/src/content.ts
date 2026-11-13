// Runs on normal web pages. Read-only toward the page: it answers "what is selected?" and draws Tether's
// own bubble in a closed shadow root. It never touches the page's content.
// No "already loaded" guard: after the extension is reloaded, a tab still holds the old (dead) copy of this script,
// and a guard would stop the new one from starting. The background only injects when no live copy answers.
document.getElementById("tether-root")?.remove(); // leftover bubble from a previous copy
init();

function init() {
  const extOrigin = new URL(chrome.runtime.getURL("/")).origin;
  let panel: HTMLDivElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let visible = false;
  let lastFocus: Element | null = null;

  const CSS = `
    :host { all: initial; }
    .panel {
      position: fixed; top: 12px; right: 12px; z-index: 2147483647;
      width: 380px; max-width: calc(100vw - 24px); height: min(620px, calc(100vh - 24px));
      border-radius: 22px; overflow: hidden;
      background: rgba(var(--g, 246, 246, 244), var(--a, 0.66));
      -webkit-backdrop-filter: blur(32px) saturate(1.9); backdrop-filter: blur(32px) saturate(1.9);
      border: 1px solid var(--edge, rgba(255, 255, 255, 0.7));
      box-shadow: var(--shadow, 0 28px 70px rgba(0, 0, 0, 0.22), 0 2px 10px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6));
      transform-origin: top right; opacity: 0; transform: scale(0.94) translateY(-6px); visibility: hidden;
      transition: opacity 160ms ease, transform 160ms ease, visibility 0s linear 160ms;
    }
    .panel.open {
      opacity: 1; transform: none; visibility: visible;
      transition: opacity 200ms ease, transform 260ms cubic-bezier(0.2, 0.9, 0.25, 1.1), visibility 0s;
    }
    iframe { display: block; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: light; }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .panel { background: rgba(var(--g, 246, 246, 244), 0.97); }
    }
    @media (prefers-reduced-motion: reduce) { .panel, .panel.open { transition: none; } }
  `;

  function build() {
    const host = document.createElement("div");
    host.id = "tether-root";
    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = CSS;
    panel = document.createElement("div");
    panel.className = "panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Tether");
    frame = document.createElement("iframe");
    frame.title = "Tether";
    frame.setAttribute("allow", "microphone; clipboard-write");
    frame.src = chrome.runtime.getURL("sidepanel.html?mode=bubble");
    panel.append(frame);
    root.append(style, panel);
    document.documentElement.append(host);
    void panel.offsetWidth; // commit the closed state so the first open animates
  }

  const tell = (type: string) => frame?.contentWindow?.postMessage({ type }, extOrigin);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") hide();
  }

  function show() {
    if (!panel) build();
    if (visible || !panel || !frame) return;
    visible = true;
    lastFocus = document.activeElement;
    panel.classList.add("open");
    frame.focus();
    tell("tether:shown");
    document.addEventListener("keydown", onKey);
  }

  function hide() {
    if (!visible || !panel) return;
    visible = false;
    panel.classList.remove("open");
    tell("tether:hidden");
    document.removeEventListener("keydown", onKey);
    if (lastFocus instanceof HTMLElement && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  /** The app tells us its glass colour so the blur layer matches the day / night theme and tint. */
  function applyGlass(m: { rgb?: unknown; alpha?: unknown; dark?: unknown }) {
    if (!panel || typeof m.rgb !== "string" || !/^\d{1,3}, \d{1,3}, \d{1,3}$/.test(m.rgb)) return;
    const alpha = Number(m.alpha);
    if (!(alpha >= 0 && alpha <= 1)) return;
    const dark = m.dark === true;
    panel.style.setProperty("--g", m.rgb);
    panel.style.setProperty("--a", String(alpha));
    panel.style.setProperty("--edge", dark ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.7)");
    panel.style.setProperty("--shadow", dark
      ? "0 28px 70px rgba(0, 0, 0, 0.55), 0 2px 10px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.12)"
      : "0 28px 70px rgba(0, 0, 0, 0.22), 0 2px 10px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.6)");
  }

  // Messages from our own iframe only (right window, extension origin).
  window.addEventListener("message", (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== extOrigin) return;
    if (e.data?.type === "tether:close") hide();
    else if (e.data?.type === "tether:glass") applyGlass(e.data);
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "tether:getSelection") {
      sendResponse({ text: String(window.getSelection() ?? ""), url: location.href, title: document.title });
    } else if (msg?.type === "tether:toggle") {
      if (visible) hide(); else show();
      sendResponse({ ok: true });
    } else if (msg?.type === "tether:show") {
      show();
      sendResponse({ ok: true });
    }
  });
}
