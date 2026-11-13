# Tether

A Chrome side-panel extension for neurodivergent learners (ADHD, dyslexia, executive dysfunction, visual processing sensitivity).

Most AI study tools explain the paragraph in front of you. Tether also **remembers why you were stuck in the first place**.

## The three layers

| Layer | What it does |
| --- | --- |
| **1. Read** | Highlight a confusing passage on any page (or paste one in). The panel returns 3–6 chunk cards: a plain heading, a one-sentence takeaway, and expandable detail. Jargon is underlined, and clicking a term gives a plain definition, an everyday analogy and why it matters here. Font, spacing, tint and bionic reading are adjustable. |
| **2. Tutor** | Tether talks you through a problem in 4–8 steps while writing the working onto a notepad canvas. Interrupt any step by voice or click, ask about it, and resume. Checkpoints ask whether you actually followed. |
| **3. Memory** | Everything you look up or mark "not sure" is logged locally. The log keeps the glossary across documents, keeps analogies consistent across sessions, starts Tutor Mode at the prerequisite you are actually weak on, and shows a re-entry card instead of a blank panel. **This layer is the differentiator. It does not get cut.** |

Problems the UX stays anchored to: cognitive overload on dense text, working-memory decay across a long document, opaque diagrams and slides, visual crowding and glare.

**Principle:** behaviour is user-controlled. The extension never rewrites or modifies the host page on its own.

## Stack

- Chrome Extension, Manifest V3, `chrome.sidePanel` API. Chrome only.
- TypeScript + React + Vite, multi-entry (side panel page, background service worker, content script). Builds with `npm run build` into `dist/`.
- Small Node + Express proxy that holds the Anthropic API key. **The key never goes in extension code.**
- Model from env var `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). Structured JSON for analysis and lessons, streaming for chat.
- KaTeX for math. Plain CSS variables for styling, with no UI library, so theming is trivial.

## Repo layout

```
/extension   Vite + React + TS, MV3
/server      proxy + prompt templates
/seed        demo seed data for the struggle log
/README.md
```

## API contracts

Every response is validated against a zod schema before rendering, with one retry on malformed JSON.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/analyze-text` | `{ text, knownTerms, pinnedAnalogies }` → `{ overview, chunks[], terms[] }`. Text capped at ~6000 chars. Max 8 terms, 3–6 chunks, about grade 8 reading level. Pinned analogies are reused. |
| `POST /api/lesson` | `{ problem, imageBase64?, mediaType?, strugglingWith }` → `{ title, goal, steps[4–8], commonMistake }`. Each step has `narration`, `visual {kind, content, refs}` and an optional `checkpoint`. |
| `POST /api/lesson-step` | Regenerates one step at a simpler level ("not sure" or "explain differently"). |
| `POST /api/analyze-image` | `{ imageBase64, mediaType }` → `{ summary, components[] }`. Says so if the image is unreadable. |
| `POST /api/chat` (streaming) | `{ messages, context }`. Short answers, supports reframing ("explain like a water pipe system"). |

## The struggle log

One store in `chrome.storage.local`, never sent anywhere except as prompt context for the current request.

```jsonc
{
  "terms":    [{ "term", "lookups", "lastSeen", "sources": [urls], "pinnedAnalogy" }],
  "notSure":  [{ "topic", "stepId", "lessonTitle", "at" }],
  "sessions": [{ "url", "title", "lastChunkRead", "openQuestion", "at" }]
}
```

Four features read from it, and each must visibly work before shipping:

1. **Glossary drawer.** Every opened term is added, deduplicated and sorted by lookup count. It persists across pages and can be cleared.
2. **Analogy consistency.** A thumbs-up pins the analogy, and pinned analogies are passed into every later `/api/analyze-text` and `/api/lesson` call.
3. **Prerequisite start.** Tutor Mode passes the top `notSure` topics and most-looked-up terms as `strugglingWith`, and the UI shows a visible line such as *"Starting from call stack, since you flagged it twice last week."*
4. **Re-entry card.** The empty state shows your last session: where you stopped, the takeaway you reached, your open question, and one small next action.

## Milestones

Built in order, one at a time, each tested before the next starts.

- [x] **M1 – Skeleton.** MV3 manifest, side panel opens on toolbar click, React app with header, text input and results area, background worker and content script wired up.
- [ ] **M2 – Backend and text analysis.** Proxy with `/api/analyze-text`, CORS locked to the extension origin, key from env, rate limit. Chunk cards with expandable details. Friendly error states. Target: a dense paragraph becomes cards in under ~8s.
- [ ] **M3 – Highlight to send.** Right-click "Send to Tether" on selected text. Chrome's built-in PDF viewer blocks content scripts, so that case shows a copy-paste message instead.
- [ ] **M4 – Terms, glossary, struggle log.** Underlined terms with a popover (definition, analogy, why it matters, thumbs-up to pin). Struggle log store and glossary drawer.
- [ ] **M5 – Tutor Mode.** 4–8 narrated steps drawn on a notepad canvas, with interrupt by voice or click, resume, checkpoints, and full keyboard operation.
- [ ] **M6 – Memory tie-in and re-entry.** `strugglingWith` passed to lessons, the visible "starting from X" line, and the re-entry card.
- [ ] **M7 – Sensory toolkit.** Local OpenDyslexic font, line-height and letter-spacing sliders, tint presets (Default, Warm Cream, Muted Slate), bionic reading. Persisted in `chrome.storage.sync` and labelled as reading preferences, not treatments.
- [ ] **M8 – Image clarifier.** Drop or paste an image, client-side resize to 1600px max, component breakdown, chat about the image.
- [ ] **M9 – Polish.** "Try an example" button, loading skeletons, 4.5:1 contrast in every tint, visible focus rings, full README and demo script.

## Setup (current state: M1)

Requires Node 20+ and Chrome.

```bash
cd extension
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `extension/dist`. Click the Tether toolbar icon to open the side panel.

### Server env vars (from M2)

| Variable | Default | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | Required. Server-side only. |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | |
| `PORT` | `8787` | |
| `ALLOWED_ORIGINS` | the extension origin | CORS lock. |

## Known limitations

- Chrome only.
- Chrome's built-in PDF viewer blocks content scripts, so highlight-to-send falls back to copy-paste there.

## Demo script

Written in M9. The finished version lives on the `feature/tether-build` branch.
