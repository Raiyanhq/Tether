# Tether

A Chrome side-panel extension for neurodivergent learners. It breaks dense text into small cards, tutors you through a problem on a notepad, and, unlike other study tools, **remembers why you got stuck** (the struggle log).

- **Read**: highlight or paste a passage, get 3–6 chunk cards, underlined jargon with plain definitions and analogies.
- **Tutor**: a 4–8 step lesson, spoken aloud while the working is written on a notepad in a handwriting style, with a pen that writes the problem and each step as it is spoken. Interrupt any step by voice, click or keyboard. The voice can be a natural ElevenLabs voice, with the browser's built-in voice as the fallback.
- **Memory**: everything you look up or mark "not sure" is stored locally and used to keep analogies consistent, start lessons at the weak prerequisite, and re-orient you when you come back.

```
/extension   Chrome MV3 extension (Vite + React + TypeScript)
/server      Express proxy that holds the model API key + prompt templates (Gemini by default)
/seed        demo struggle log and offline demo lesson
```

## Quick start (local)

Requires Node 20+ and Chrome.

### 1. Server

```bash
cd server
npm install
cp .env.example .env        # then put your key in GEMINI_API_KEY
npm run dev                 # http://localhost:8787
```

No key yet? `npm run start:mock` serves canned responses so the whole UI works offline.

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_PROVIDER` | auto | `gemini` or `anthropic`. If unset, whichever key is present is used (Gemini first). |
| `GEMINI_API_KEY` | – | Required for Gemini unless `MOCK_LLM=1`. Never goes in extension code. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Any Gemini model id with image input and JSON output. `gemini-3.5-flash-lite` answers in about 2 to 3 seconds. `gemini-3.6-flash` took about 20 seconds in testing because it thinks first. |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | – / `claude-sonnet-5-5` | Optional alternative provider. |
| `PORT` | `8787` | |
| `ALLOWED_ORIGINS` | the extension's origin | Comma-separated. CORS is locked to these. The extension has a fixed id (see below), so the default works. |
| `RATE_LIMIT_PER_MIN` | `60` | Per client IP. |
| `TRUST_PROXY` | `0` | Set `1` behind a reverse proxy or PaaS. |
| `ELEVENLABS_API_KEY` | – | Optional. Turns on the natural voice. Without it Tutor Mode uses the browser's built-in voice. |
| `ELEVENLABS_VOICE_ID` | `EXAVITQu4vr4xnSDxMaL` (Sarah) | Free plans can only use premade voices through the API (Sarah, Adam `pNInz6obpgDQGcFmaJgB`, Antoni `ErXwobaYiN019PkySvjV`). Library voices need a paid plan. |
| `ELEVENLABS_MODEL` | `eleven_flash_v2_5` | Low-latency model. `eleven_v4` is higher quality but slower. |
| `MOCK_LLM` | – | `1` = canned responses and a silent mock voice, no keys. |

Check the real model end to end: `npm run smoke`.

### 2. Extension

```bash
cd extension
npm install
npm run build:demo          # build with the "Load demo history" button
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick `extension/dist`. Click the Tether toolbar icon to open the side panel. The extension id is fixed (`dncappfhfginimfcnmcndijoophkdcpl`, from the `key` in the manifest) so the server's CORS lock is deterministic.

`npm run build` makes the production build, without the demo button.

### Tests

```bash
cd server && npm test            # proxy, validation, retry, SSE, Gemini and Anthropic backends against fake endpoints
cd extension && npm test         # struggle log, seed, WCAG contrast for every tint, prefs
cd extension && npm run e2e      # drives a separate build in real Chromium against its own mock server on :8788 (safe to run while your dev server is up)
```

## Going live

1. Deploy `/server` anywhere that runs Node or Docker (a `Dockerfile` is included). Set `GEMINI_API_KEY`, and `TRUST_PROXY=1` if behind a proxy. HTTPS is required.
2. Rebuild the extension pointing at it: `VITE_SERVER_URL=https://your-host npm run build`. The build also rewrites `host_permissions` in the manifest.
3. The server keeps no database and logs no user text: it forwards and forgets.

## Demo script (3 minutes)

Setup: server running, extension loaded from `npm run build:demo`, open any normal article in a tab.

1. **(0:00) The problem.** "Dense text, and you forget why you were stuck." Click **Clear my history** to show a cold start, then **Load demo history**: a week of one student's struggles.
2. **(0:20) Re-entry.** Reload the panel. The empty state is a re-entry card: where you stopped, what you'd reached, your open question. Not a blank box.
3. **(0:40) Read.** Click **Try an example**. Cards appear. Open **More detail**. Click an underlined term: definition, analogy, why it matters. Press 👍: the analogy is pinned. Open **Glossary**: terms persist across pages.
4. **(1:10) Consistency.** Click **Break it down** again: the pinned analogy is reused. Highlight text on the article, right-click, **Send to Tether**.
5. **(1:30) Tutor.** On the **Tutor** tab note the line *"Starting from 'call stack', since you flagged it twice this week."* Click **Try an example**, then **Start lesson**. The lesson opens on the weak prerequisite and draws onto the notepad.
6. **(2:00) Interrupt.** Click the notepad (or press Space), ask "why do we need that?", hear the answer, press **Got it, continue**. At the checkpoint press **Not sure**: the step is simplified and the topic is added to the log.
7. **(2:30) Keyboard + sensory.** Space pauses, ← → change step, Esc stops. Open **Reading**: tint, OpenDyslexic, line spacing, bionic. Mention these are preferences, not treatments.
8. **(2:50) Privacy.** The log stays on the device. **Clear my history** is always visible.

Fallbacks: if the venue wifi dies, the demo lesson plays from a built-in copy, and the last lesson per problem is cached.

## Privacy

- The struggle log lives in `chrome.storage.local`. It is sent to the server only as prompt context for the current request.
- The server never logs or stores request text.
- If you turn on the natural voice, the lines Tether speaks (lesson narration and answers to your questions) go through your server to ElevenLabs to be turned into audio. Your struggle log and the pages you read are not sent. Untick **Natural voice** in the Tutor controls, or leave `ELEVENLABS_API_KEY` unset, to keep all speech on the device.
- No accounts, no database, no analytics.
- The extension never modifies the host page. The content script only reads the current selection when the panel asks.

## Accessibility notes

- Everything voice does can be done by keyboard, and narration text is always on screen. **Mute voice, read silently** is in the Tutor controls.
- Space = pause/play, ← → = previous/next step, Esc = stop.
- `prefers-reduced-motion` disables all animation.
- Every tint preset meets 4.5:1 for text (checked by a unit test).
- OpenDyslexic and bionic reading are offered as reading preferences. There is no solid evidence they improve comprehension or speed, though some people prefer them, and the UI doesn't claim otherwise.

## Known limitations

- Chrome's built-in PDF viewer blocks content scripts, so highlight-to-send shows a copy-and-paste message instead.
- Voice input (push-to-talk, hands-free) depends on Chrome allowing microphone access from a side panel. If blocked, the panel offers a one-click tab to grant it, and typing always works. Hands-free barge-in relies on echo cancellation; use headphones for the best result.
- The natural voice uses ElevenLabs credits per character. Tether caches each spoken line for the session and prefetches the next step, so replays and pauses cost nothing extra.
- Chrome only.
