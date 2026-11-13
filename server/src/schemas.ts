import { z } from "zod";

export const MAX_TEXT_CHARS = 6000;

// ---------- analyze-text ----------
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
  terms: z.array(TermSchema).transform((t) => t.slice(0, 8)),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const PinnedAnalogySchema = z.object({ term: z.string(), analogy: z.string() });

export const AnalyzeTextRequestSchema = z.object({
  text: z.string().min(1),
  knownTerms: z.array(z.string()).max(300).default([]),
  pinnedAnalogies: z.array(PinnedAnalogySchema).max(100).default([]),
});

// ---------- lesson ----------
export const VisualSchema = z.object({
  kind: z.enum(["text", "math", "box", "arrow", "highlight", "none"]),
  content: z.string().default(""),
  refs: z.array(z.string()).default([]),
});

export const StepSchema = z.object({
  id: z.string().min(1),
  narration: z.string().min(1),
  visual: VisualSchema.default({ kind: "none", content: "", refs: [] }),
  checkpoint: z
    .string()
    .nullish()
    .transform((v) => (v ? v : undefined)),
  // Short noun phrase for the struggle log (e.g. "call stack"). Optional addition to the contract.
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

export const MEDIA_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const MediaTypeSchema = z.enum(MEDIA_TYPES);
// ~10MB of base64 is already far more than the 1600px client-side resize produces.
const Base64Schema = z.string().min(1).max(10_000_000);

export const LessonRequestSchema = z.object({
  problem: z.string().min(1).max(MAX_TEXT_CHARS),
  imageBase64: Base64Schema.optional(),
  mediaType: MediaTypeSchema.optional(),
  strugglingWith: z.array(z.string()).max(20).default([]),
  // Added so pinned analogies reach lessons too (struggle-log feature 2).
  pinnedAnalogies: z.array(PinnedAnalogySchema).max(100).default([]),
});

export const LessonStepRequestSchema = z.object({
  lesson: z.object({
    title: z.string(),
    goal: z.string(),
    steps: z.array(StepSchema).min(1).max(8),
  }),
  stepId: z.string(),
  reason: z.enum(["not sure", "explain differently"]),
  strugglingWith: z.array(z.string()).max(20).default([]),
});

// ---------- image ----------
export const ImageAnalysisSchema = z.object({
  summary: z.string().min(1),
  components: z.array(z.object({ label: z.string(), explanation: z.string() })).max(20),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

export const AnalyzeImageRequestSchema = z.object({
  imageBase64: Base64Schema,
  mediaType: MediaTypeSchema,
});

// ---------- chat ----------
export const ChatContextSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    passage: z.string().max(MAX_TEXT_CHARS * 2),
    overview: z.string().optional(),
  }),
  z.object({
    type: z.literal("image"),
    summary: z.string().optional(),
    components: z.array(z.object({ label: z.string(), explanation: z.string() })).optional(),
    imageBase64: Base64Schema.optional(),
    mediaType: MediaTypeSchema.optional(),
  }),
  z.object({
    type: z.literal("lesson-step"),
    title: z.string(),
    stepsSoFar: z.array(StepSchema).max(8),
    currentStep: StepSchema,
  }),
]);
export type ChatContext = z.infer<typeof ChatContextSchema>;

export const ChatRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .min(1)
    .max(30),
  context: ChatContextSchema,
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

// ---------- speak ----------
export const SpeakRequestSchema = z.object({ text: z.string().min(1).max(1500) });

// ---------- extract-text (read the text in a screenshot) ----------
export const ExtractTextRequestSchema = z.object({ imageBase64: Base64Schema, mediaType: MediaTypeSchema });
export const ExtractTextSchema = z.object({ text: z.string(), note: z.string().nullish().transform((v) => v || undefined) });
export type ExtractText = z.infer<typeof ExtractTextSchema>;
