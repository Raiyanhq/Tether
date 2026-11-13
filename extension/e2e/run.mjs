import { chromium } from "playwright";
import os from "node:os"; import path from "node:path"; import fs from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// End-to-end check of the built extension in real Chromium, against the server in MOCK_LLM mode (no API key needed).
// Run with: npm run e2e   (builds with the demo-history button, starts the mock server, drives the panel)
const here = path.dirname(fileURLToPath(import.meta.url));
// Own build folder and own port, so it never disturbs your real dist/ or a server you have running.
const EXT = path.resolve(here, "../dist-e2e");
const PORT = 8788;
// Chrome derives the extension id from the manifest "key": sha256 of the public key, first 32 hex digits mapped to a-p.
const key = Buffer.from(JSON.parse(fs.readFileSync(path.join(EXT, "manifest.json"), "utf8")).key, "base64");
const ID = [...createHash("sha256").update(key).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

const server = spawn("npx", ["tsx", "src/index.ts"], {
  cwd: path.resolve(here, "../../server"),
  env: { ...process.env, MOCK_LLM: "1", PORT: String(PORT), ALLOWED_ORIGINS: `chrome-extension://${ID}` },
  stdio: "ignore",
});
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}
process.on("exit", () => server.kill());
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tether-prof-"));
let failures = 0;
const ok = (c, m) => { console.log(`${c ? "PASS" : "FAIL"}  ${m}`); if (!c) failures++; };

const ctx = await chromium.launchPersistentContext(dir, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--headless=new", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  viewport: { width: 420, height: 900 },
});
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker");
ok(sw.url().includes(ID), `service worker loaded with stable id ${ID}`);

const open = async () => { const p = await ctx.newPage(); await p.goto(`chrome-extension://${ID}/sidepanel.html`); return p; };
let page = await open();
const bodies = [];
page.on("request", (r) => { if (r.url().includes("/api/") && r.method() === "POST") bodies.push({ url: r.url(), body: JSON.parse(r.postData() || "{}") }); });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const store = (area = "local") => page.evaluate((a) => chrome.storage[a].get(null), area);

// ---- M1
ok(await page.locator("h1", { hasText: "Tether" }).isVisible(), "panel renders header");

// ---- M2 / M4 read
await page.getByRole("button", { name: "Try an example" }).first().click();
await page.locator("article.card").first().waitFor({ timeout: 8000 });
const cards = await page.locator("article.card").count();
ok(cards >= 1, `chunk cards rendered (${cards})`);
const termBtn = page.locator("button.term").first();
ok(await termBtn.count() > 0, "jargon is underlined as buttons");
await page.getByRole("button", { name: "More detail" }).first().click();
ok(await page.locator(".details").first().isVisible(), "detail expands");
await termBtn.click();
ok(await page.getByRole("dialog").first().isVisible(), "term popover opens");
const termName = await page.locator(".popover h3").innerText();
await page.getByRole("button", { name: /This analogy helps/ }).click();
ok(await page.getByRole("button", { name: /Analogy pinned/ }).isVisible(), "thumbs-up pins analogy");
await page.keyboard.press("Escape");
ok(await page.locator(".popover").count() === 0, "Escape closes popover");
let s = await store();
ok(s.struggleLog.terms.some((t) => t.term.toLowerCase() === termName.toLowerCase() && t.lookups >= 1 && t.pinnedAnalogy), "struggle log has looked-up + pinned term");
ok(s.struggleLog.sessions.length === 1, "session saved");

// pinned analogy is sent in next analysis
bodies.length = 0;
await page.getByRole("button", { name: "Break it down" }).click();
await page.locator("article.card").first().waitFor();
const az = bodies.find((b) => b.url.endsWith("/analyze-text"));
ok(az?.body.pinnedAnalogies?.length >= 1 && az.body.knownTerms.length >= 1, "next analyze-text carries pinnedAnalogies + knownTerms");

// glossary persists across "pages" (a different source url)
await page.getByRole("button", { name: "Reading" }).click();
ok(await page.getByRole("dialog", { name: /Reading preferences/ }).isVisible(), "settings popover opens");
await page.getByLabel("OpenDyslexic font").check();
await page.getByLabel("Bionic reading (bold word starts)").check();
await page.getByLabel("Warm Cream").check();
ok(await page.locator("b.bionic").count() > 0, "bionic reading applies instantly");
ok((await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes("OpenDyslexic"), "OpenDyslexic applied");
ok((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg"))).trim() === "#f8f1de", "tint applied via CSS variable");
await page.keyboard.press("Escape");
ok(await page.getByRole("dialog", { name: /Reading preferences/ }).count() === 0, "Escape closes settings");
await page.reload();
await page.waitForTimeout(400);
ok((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg"))).trim() === "#f8f1de", "preferences survive reload (sync storage)");
ok(((await store("sync")).prefs ?? {}).dyslexicFont === true, "prefs stored in chrome.storage.sync");

// ---- M3 highlight to send
const pending = { kind: "text", text: "Photosynthesis converts light energy into chemical energy. Chloroplasts contain chlorophyll. The process produces glucose and oxygen.", url: "https://example.com/bio", title: "Biology notes", at: Date.now() };
bodies.length = 0;
await page.evaluate((p) => chrome.storage.session.set({ pendingSelection: p }), pending);
await page.locator("article.card").first().waitFor({ timeout: 8000 });
ok(await page.locator("#read-input").inputValue() === pending.text, "context-menu selection lands in panel and auto-analyzes");
ok((await store()).struggleLog.sessions.some((x) => x.url === "https://example.com/bio"), "session recorded with page url");
await page.evaluate(() => chrome.storage.session.set({ pendingSelection: { kind: "pdf", at: Date.now() } }));
await page.getByText(/PDF viewer/).first().waitFor({ timeout: 4000 });
ok(true, "PDF viewer shows copy-paste message");

// too long
await page.locator("#read-input").fill("x ".repeat(3500));
await page.getByRole("button", { name: "Break it down" }).click();
ok(await page.getByRole("alert").getByText(/Select about 6,000/).isVisible(), "over-limit text asks user to select less");
await page.locator("#read-input").fill("");

// ---- glossary
await page.getByRole("button", { name: "Glossary" }).click();
ok(await page.locator(".glossary li").count() >= 1, "glossary lists opened terms");
await page.keyboard.press("Escape");

// ---- M6 seeded history + tutor
await page.getByRole("button", { name: "Load demo history" }).click();
s = await store();
ok(s.struggleLog.terms.reduce((n, t) => n + t.lookups, 0) === 12, "seed loads ~12 lookups");
await page.getByRole("button", { name: "Clear my history" }).click();
ok(await page.getByRole("button", { name: "Yes, clear it" }).isVisible(), "clear history asks for confirmation");
await page.getByRole("button", { name: "Cancel" }).click();

await page.reload();
await page.getByRole("tab", { name: "Tutor" }).click();
ok(await page.getByText(/Starting from "call stack", since you flagged it twice this week/).first().isVisible(), "tutor shows visible 'starting from' line");
// read tab empty state shows re-entry
await page.getByRole("tab", { name: "Read" }).click();
ok(await page.getByText("Pick up where you left off").isVisible(), "re-entry card replaces empty state");
ok(await page.getByText("why does the base case matter").first().isVisible(), "re-entry shows open question");
await page.getByRole("button", { name: "Work through it in Tutor Mode" }).click();
await page.waitForTimeout(300); const tv = await page.locator("#tutor-input").inputValue(); ok(tv.includes("base case"), "re-entry hands the question to Tutor: " + JSON.stringify(tv));

await page.locator("#tutor-input").fill("Trace factorial(4) written recursively");
await page.getByLabel("Mute voice, read silently").waitFor({ state: "hidden" }).catch(() => {});
bodies.length = 0;
await page.getByRole("button", { name: "Start lesson" }).click();
await page.locator(".pad-item").first().waitFor({ timeout: 8000 });
const lessonReq = bodies.find((b) => b.url.endsWith("/api/lesson"));
ok(lessonReq?.body.strugglingWith?.[0] === "call stack", `lesson request strugglingWith = ${JSON.stringify(lessonReq?.body.strugglingWith)}`);
ok(lessonReq?.body.pinnedAnalogies?.some((p) => p.term === "amortized"), "lesson request carries pinned analogies");
ok(await page.getByText(/Step 1 of 7/).isVisible(), "lesson plays from step 1 of 7");

// keyboard control
await page.getByLabel("Mute voice, read silently").check();
await page.locator(".tutor").focus();
await page.keyboard.press("Space");
ok(await page.getByText(/paused/).isVisible(), "Space pauses");
await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
ok(await page.getByText(/Step 3 of 7/).isVisible(), "ArrowRight steps forward");
await page.keyboard.press("ArrowLeft");
ok(await page.getByText(/Step 2 of 7/).isVisible(), "ArrowLeft steps back");
await page.keyboard.press("ArrowRight");
ok(await page.locator(".pad-item").count() === 3, "notepad shows steps up to current");
ok(await page.locator(".katex").count() >= 1, "math step rendered with KaTeX");
await page.keyboard.press("Space");
ok(await page.getByText("Quick check").waitFor({ timeout: 25000 }).then(() => true), "checkpoint appears on step 3");
// not sure -> logs + rewrites
await page.getByRole("button", { name: "Not sure" }).click();
await page.waitForTimeout(400);
s = await store();
ok(s.struggleLog.notSure.length === 3, "'Not sure' writes to struggle log");
ok(bodies.some((b) => b.url.endsWith("/lesson-step") && b.body.reason === "not sure"), "'Not sure' calls /api/lesson-step");
await page.getByRole("button", { name: "Pause" }).click();
// interrupt by clicking the pad
await page.getByRole("button", { name: "Ask about this step" }).first().click();
ok(await page.getByRole("heading", { name: /Ask about step/ }).isVisible(), "interrupt opens ask panel");
bodies.length = 0;
await page.locator("#ask-q").fill("why is it needed?");
await page.getByRole("button", { name: "Ask", exact: true }).click();
await page.locator(".answer", { hasText: "Short answer" }).waitFor({ timeout: 6000 });
const chatReq = bodies.find((b) => b.url.endsWith("/api/chat"));
ok(chatReq?.body.context.type === "lesson-step" && chatReq.body.context.currentStep.id === "s3", "chat gets lesson-step context for the current step");
await page.getByRole("button", { name: "Explain that step differently" }).click();
await page.waitForTimeout(500);
ok(bodies.some((b) => b.url.endsWith("/lesson-step") && b.body.reason === "explain differently"), "'Explain differently' regenerates just that step");
await page.getByRole("button", { name: "Ask about this step" }).first().click();
await page.getByRole("button", { name: "Got it, continue" }).click();
ok(await page.getByRole("button", { name: "Pause" }).isVisible(), "'Got it, continue' resumes playback");
await page.keyboard.press("Escape");

// ---- M8 image
await page.getByRole("tab", { name: "Image" }).click();
await page.getByRole("button", { name: "Try an example diagram" }).click();
await page.locator("article.card").first().waitFor({ timeout: 8000 });
ok(bodies.some((b) => b.url.endsWith("/analyze-image") && b.body.mediaType === "image/png" && b.body.imageBase64.length > 1000), "example diagram resized and sent to analyze-image");
bodies.length = 0;
await page.locator("#chat-Ask\\ about\\ this\\ image").fill("what does arrow B mean?");
await page.getByRole("button", { name: "Ask", exact: true }).last().click();
await page.locator(".msg.assistant", { hasText: "Short answer" }).waitFor({ timeout: 6000 });
ok(bodies.find((b) => b.url.endsWith("/api/chat"))?.body.context.imageBase64?.length > 1000, "image chat includes the image");

// ---- clear
await page.getByRole("tab", { name: "Read" }).click();
await page.getByRole("button", { name: "Clear my history" }).click();
await page.getByRole("button", { name: "Yes, clear it" }).click();
await page.waitForTimeout(300);
s = await store();
ok(!s.struggleLog || (s.struggleLog.terms.length === 0 && s.struggleLog.notSure.length === 0), "clear my history empties the log");

// ---- mic spike (extension origin, fake device)
const mic = await page.evaluate(async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); return "ok"; } catch (e) { return e.name; } });
console.log(`INFO  getUserMedia on extension origin (fake device): ${mic}; SpeechRecognition present: ${await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition))}; speechSynthesis present: ${await page.evaluate(() => "speechSynthesis" in window)}`);

ok(errors.length === 0, `no console/page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
await page.screenshot({ path: path.join(os.tmpdir(), "tether-e2e-final.png") });
await ctx.close();
console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
