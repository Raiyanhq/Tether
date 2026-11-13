// Offline stand-in for the model. Used by `npm run start:mock` and handy for demos with no network.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { LessonSchema, type Lesson } from "./schemas.js";
import type { Llm } from "./llm.js";

function demoLesson(): Lesson {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(resolve(here, "../../seed/demo-lesson.json"), "utf8");
  return LessonSchema.parse(JSON.parse(raw));
}

export function createMockLlm(): Llm {
  return {
    async analyzeText(req) {
      const sentences = req.text.split(/(?<=[.!?])\s+/).filter(Boolean);
      const size = Math.max(1, Math.ceil(sentences.length / 3));
      const chunks = [];
      for (let i = 0; i < sentences.length && chunks.length < 6; i += size) {
        const part = sentences.slice(i, i + size);
        chunks.push({
          id: `c${chunks.length + 1}`,
          heading: `Part ${chunks.length + 1}`,
          takeaway: part[0],
          details: part.join(" "),
        });
      }
      const words = Array.from(new Set(req.text.match(/\b[a-zA-Z]{9,}\b/g) ?? [])).slice(0, 3);
      const pinned = new Map(req.pinnedAnalogies.map((p) => [p.term.toLowerCase(), p.analogy]));
      return {
        overview: sentences[0] ?? req.text.slice(0, 80),
        chunks,
        terms: words.map((w) => ({
          term: w,
          definition: `${w} is a technical word used in this passage.`,
          analogy: pinned.get(w.toLowerCase()) ?? `Think of ${w} like a recipe step you repeat.`,
          whyItMatters: `It is central to understanding this passage.`,
        })),
      };
    },
    async lesson(req) {
      const l = demoLesson();
      return { ...l, title: req.problem.slice(0, 60) || l.title };
    },
    async lessonStep(req) {
      const step = req.lesson.steps.find((s) => s.id === req.stepId) ?? req.lesson.steps[0];
      return { ...step, narration: `Let me say that more simply. ${step.narration}` };
    },
    async analyzeImage() {
      return {
        summary: "A diagram with labelled arrows (mock response).",
        components: [{ label: "Arrow B", explanation: "Shows where the data goes next." }],
      };
    },
    async extractText() {
      return { text: "Photosynthesis converts light energy into chemical energy. Chloroplasts contain chlorophyll, which absorbs light. The process produces glucose and oxygen." };
    },
    async *chat(req) {
      const last = req.messages[req.messages.length - 1]?.content ?? "";
      for (const w of `Short answer to "${last.slice(0, 40)}": think of it step by step.`.split(" ")) {
        yield w + " ";
      }
    },
  };
}
