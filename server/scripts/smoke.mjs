// Sanity-check a running server with the real model: node scripts/smoke.mjs [http://localhost:8787]
// Sends the extension's Origin so the CORS lock lets it through.
const base = process.argv[2] || "http://localhost:8787";
const origin = process.env.SMOKE_ORIGIN || (process.env.ALLOWED_ORIGINS || "").split(",")[0] || "chrome-extension://dncappfhfginimfcnmcndijoophkdcpl";
const post = (path, body) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });

const t0 = Date.now();
const text = "Amortized analysis bounds the cost of a sequence of operations rather than any single one. A dynamic array that doubles when full has rare, expensive resizes, so the average cost per append stays constant.";
let r = await post("/api/analyze-text", { text, knownTerms: [], pinnedAnalogies: [{ term: "amortized", analogy: "paying a yearly bill in monthly instalments" }] });
const a = await r.json();
console.log(`analyze-text  ${r.status}  ${Date.now() - t0}ms  chunks=${a.chunks?.length} terms=${a.terms?.map((t) => t.term).join(", ")}`);
console.log("  amortized analogy:", a.terms?.find((t) => /amortized/i.test(t.term))?.analogy);

const t1 = Date.now();
r = await post("/api/lesson", { problem: "Solve 2x + 6 = 14", strugglingWith: ["inverse operations"], pinnedAnalogies: [] });
const l = await r.json();
console.log(`lesson        ${r.status}  ${Date.now() - t1}ms  steps=${l.steps?.length}  checkpoints=${l.steps?.filter((s) => s.checkpoint).length}`);
console.log("  step 1:", l.steps?.[0]?.narration);

r = await post("/api/chat", { messages: [{ role: "user", content: "Explain amortized cost like a water pipe." }], context: { type: "text", passage: text } });
console.log(`chat          ${r.status}  ${(await r.text()).slice(0, 120).replace(/\n/g, " ")}…`);
