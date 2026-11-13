import { z } from "zod";

// Mirrors server/src/schemas.ts. Every model reply is validated here again before rendering.
export const TermSchema = z.object({
  term: z.string().min(1),
  definition: z.string().min(1),
  analogy: z.string().min(1),
  whyItMatters: z.string().min(1),
});
export const ChunkSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  takeaway: z.string().min(1),
  details: z.string().min(1),
});
export const AnalysisSchema = z.object({
  overview: z.string().min(1),
  chunks: z.array(ChunkSchema).min(1).max(6),
  terms: z.array(TermSchema).max(8),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
export type Term = z.infer<typeof TermSchema>;

export const VisualSchema = z.object({
  kind: z.enum(["text", "math", "box", "arrow", "highlight", "none"]),
  content: z.string().default(""),
  refs: z.array(z.string()).default([]),
});
export const StepSchema = z.object({
  id: z.string().min(1),
  narration: z.string().min(1),
  visual: VisualSchema.default({ kind: "none", content: "", refs: [] }),
  checkpoint: z.string().nullish().transform((v) => (v ? v : undefined)),
  topic: z.string().nullish().transform((v) => (v ? v : undefined)),
});
export type Step = z.infer<typeof StepSchema>;
export const LessonSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  steps: z.array(StepSchema).min(4).max(8),
  commonMistake: z.string().min(1),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const ImageAnalysisSchema = z.object({
  summary: z.string().min(1),
  components: z.array(z.object({ label: z.string(), explanation: z.string() })).max(20),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;
