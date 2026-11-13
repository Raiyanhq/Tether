import type { z } from "zod";
import type { AnalyzeTextRequestSchema, LessonRequestSchema, LessonStepRequestSchema, ChatContext } from "./schemas.js";

type AnalyzeReq = z.infer<typeof AnalyzeTextRequestSchema>;
type LessonReq = z.infer<typeof LessonRequestSchema>;
type StepReq = z.infer<typeof LessonStepRequestSchema>;

const JSON_ONLY = "Reply with ONLY one JSON object. No markdown fences, no commentary before or after it.";

const AUDIENCE = `The reader is a student who may have ADHD, dyslexia, executive dysfunction or visual processing sensitivity. Write at roughly a grade 8 reading level. Use short sentences and plain words. Never be condescending or use praise filler.`;

function pinnedBlock(pinned: { term: string; analogy: string }[]): string {
  if (!pinned.length) return "";
  const lines = pinned.map((p) => `- ${p.term}: ${p.analogy}`).join("\n");
  return `\nThe student already liked these analogies. If any of these terms or concepts come up, reuse that same analogy frame instead of inventing a new one:\n${lines}\n`;
}

export function analyzeTextSystem(req: AnalyzeReq): string {
  const known = req.knownTerms.length
    ? `\nThe student has looked these terms up before, so you may skip re-defining them unless they are central: ${req.knownTerms.join(", ")}.\n`
    : "";
  return `You break dense text into small readable pieces.
${AUDIENCE}

Return JSON of exactly this shape:
{
  "overview": "one sentence: what this passage is about",
  "chunks": [{ "id": "c1", "heading": "short plain heading", "takeaway": "ONE plain-language sentence", "details": "2-4 sentences with the nuance, still plain language" }],
  "terms": [{ "term": "exact string as it appears in the text", "definition": "one plain-English sentence", "analogy": "one concrete everyday analogy", "whyItMatters": "one sentence tying it to this topic" }]
}

Rules:
- 3 to 6 chunks, ids c1, c2, ... in reading order. Cover the whole passage.
- At most 8 terms. Only real jargon or technical vocabulary a student could get stuck on. The "term" must be copied exactly as written in the passage.
- Do not invent facts that are not in the source text. If something is unclear in the source, say so in the details.
- Analogies must be concrete and everyday (kitchens, buses, libraries), not abstract.
${pinnedBlock(req.pinnedAnalogies)}${known}
${JSON_ONLY}`;
}

export function analyzeTextUser(req: AnalyzeReq): string {
  return `Passage:\n"""\n${req.text}\n"""`;
}

function struggleBlock(s: string[]): string {
  if (!s.length) return "";
  return `\nThe student's own history says they struggle with: ${s.join(", ")}.
If that is relevant to this problem, acknowledge it briefly in step 1 and build up from that prerequisite before the main method. If it is not relevant, ignore it.\n`;
}

export function lessonSystem(req: LessonReq): string {
  return `You are a patient tutor who talks a student through a problem while writing the working on a notepad.
${AUDIENCE}

Return JSON of exactly this shape:
{
  "title": "short title of what we are working through",
  "goal": "one sentence: what the student will be able to do after this",
  "steps": [
    {
      "id": "s1",
      "topic": "2-4 word name of the concept this step teaches",
      "narration": "what the tutor SAYS, conversational, 1-3 sentences",
      "visual": { "kind": "text | math | box | arrow | highlight | none", "content": "the line to write, or the box label", "refs": ["ids of earlier steps this points to or highlights"] },
      "checkpoint": "optional one-line question before moving on"
    }
  ],
  "commonMistake": "one sentence: where students usually go wrong here"
}

Rules:
- 4 to 8 steps. Never more than 8. Teach the method. The final step states the answer only after the reasoning is already visible on the notepad.
- narration is spoken aloud: short sentences, no markdown, no bullet characters, no LaTeX, no symbols that are awkward to say aloud. Say "x squared", not "x^2".
- LaTeX belongs only in visual.content when kind is "math".
- Use "arrow" or "highlight" only when refs point to earlier step ids. "arrow" content is a short label for the connector. "highlight" content may be empty. Use "none" when nothing needs writing.
- At least one middle step has a checkpoint, a one-line question that checks whether the student followed.
- Step ids are s1, s2, ... in order.
${struggleBlock(req.strugglingWith)}${pinnedBlock(req.pinnedAnalogies)}
${JSON_ONLY}`;
}

export function lessonUser(req: LessonReq): string {
  return `Problem:\n"""\n${req.problem}\n"""${req.imageBase64 ? "\nThe problem is also shown in the attached image." : ""}`;
}

export function lessonStepSystem(req: StepReq): string {
  const why =
    req.reason === "not sure"
      ? "The student said they are not sure after this step."
      : "The student asked for this step to be explained differently.";
  return `You are a patient tutor. ${why} Rewrite ONLY that one step at a simpler level, using a different angle or a concrete everyday example.
${AUDIENCE}

Return ONE step object of exactly this shape, keeping the same id:
{ "id": "...", "topic": "2-4 word concept name", "narration": "1-3 spoken sentences, no markdown, no LaTeX", "visual": { "kind": "text | math | box | arrow | highlight | none", "content": "...", "refs": [] }, "checkpoint": "optional one-line question" }

Do not change the meaning of the working or the final answer. Do not invent facts.
${struggleBlock(req.strugglingWith)}
${JSON_ONLY}`;
}

export function lessonStepUser(req: StepReq): string {
  return `Lesson: ${req.lesson.title}\nGoal: ${req.lesson.goal}\nSteps so far:\n${JSON.stringify(req.lesson.steps)}\n\nRewrite step ${req.stepId}.`;
}

export const IMAGE_SYSTEM = `You explain diagrams, charts and slides from textbooks and lectures.
${AUDIENCE}

Return JSON of exactly this shape:
{ "summary": "one or two plain sentences: what this image shows", "components": [{ "label": "the label as shown, or a short name", "explanation": "one plain sentence" }] }

Rules:
- List the visible parts in a sensible reading order, at most 12.
- Use the labels printed in the image when they exist (for example "Arrow B").
- If the image is unreadable, blurry or ambiguous, say so in the summary and keep components to what is clearly visible. Do not guess.
${JSON_ONLY}`;

export function chatSystem(ctx: ChatContext): string {
  const base = `You answer a student's questions.
${AUDIENCE}
Keep answers short: 1 to 4 sentences unless asked for more. If the student asks to explain it another way (for example "like a water pipe system"), reframe it that way. If you are not sure, or the source does not say, say so plainly instead of guessing. Plain text only, no markdown.`;
  if (ctx.type === "text") {
    return `${base}\n\nThe student is reading this passage:\n"""\n${ctx.passage}\n"""${ctx.overview ? `\nOverview: ${ctx.overview}` : ""}`;
  }
  if (ctx.type === "image") {
    const parts = ctx.components?.map((c) => `- ${c.label}: ${c.explanation}`).join("\n") ?? "";
    return `${base}\n\nThe student is looking at an image.${ctx.summary ? `\nSummary: ${ctx.summary}` : ""}${parts ? `\nParts:\n${parts}` : ""}`;
  }
  return `${base}

You are tutoring a lesson called "${ctx.title}". The student interrupted at the step below to ask something. Answer about that step. Your answer will be spoken aloud, so use short spoken sentences and no LaTeX.
Steps so far: ${JSON.stringify(ctx.stepsSoFar)}
Current step: ${JSON.stringify(ctx.currentStep)}`;
}
