import type { Analysis, ImageAnalysis, Lesson, Step, ChatRequest } from "./schemas.js";
import type { z } from "zod";
import type { AnalyzeTextRequestSchema, LessonRequestSchema, LessonStepRequestSchema, AnalyzeImageRequestSchema } from "./schemas.js";

export type AnalyzeReq = z.infer<typeof AnalyzeTextRequestSchema>;
export type LessonReq = z.infer<typeof LessonRequestSchema>;
export type StepReq = z.infer<typeof LessonStepRequestSchema>;
export type ImageReq = z.infer<typeof AnalyzeImageRequestSchema>;

/** The model layer. Real implementation: anthropicLlm.ts. Offline demo/dev: mockLlm.ts. */
export interface Llm {
  analyzeText(req: AnalyzeReq): Promise<Analysis>;
  lesson(req: LessonReq): Promise<Lesson>;
  lessonStep(req: StepReq): Promise<Step>;
  analyzeImage(req: ImageReq): Promise<ImageAnalysis>;
  chat(req: ChatRequest): AsyncIterable<string>;
}

/** Thrown when the model's reply is not valid JSON for the schema, even after one retry. */
export class BadModelOutputError extends Error {}
