import type { z } from "zod";
import {
  AnalysisSchema, LessonSchema, StepSchema, ImageAnalysisSchema,
  type ChatRequest,
} from "./schemas.js";
import * as P from "./prompts.js";
import { BadModelOutputError, type Llm } from "./llm.js";

export type MediaType = "image/png" | "image/jpeg" | "image/webp";
export type Part = { type: "text"; text: string } | { type: "image"; mediaType: MediaType; data: string };
export interface BackendMessage { role: "user" | "assistant"; parts: Part[] }

/** A model provider. Everything above this (prompts, validation, retry) is shared between providers. */
export interface Backend {
  complete(o: { system: string; parts: Part[]; maxTokens: number }): Promise<string>;
  stream(o: { system: string; messages: BackendMessage[]; maxTokens: number }): AsyncIterable<string>;
}

/** Thrown by backends for non-2xx provider responses. The app maps it to a 502 "upstream" error. */
export class UpstreamError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Pull a JSON object out of a model reply, tolerating code fences and stray prose. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(body.slice(start, end + 1));
}

export function createLlm(backend: Backend): Llm {
  // Validate against the schema; retry once on malformed output, then give up with a real error.
  async function json<S extends z.ZodTypeAny>(
    schema: S, system: string, parts: Part[], maxTokens: number
  ): Promise<z.output<S>> {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const sys = attempt === 0 ? system : `${system}\n\nYour previous reply was not valid. Reply with ONLY the JSON object, matching the shape exactly.`;
      const raw = await backend.complete({ system: sys, parts, maxTokens });
      try {
        return schema.parse(extractJson(raw));
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new BadModelOutputError(lastError);
  }

  const text = (t: string): Part => ({ type: "text", text: t });
  const image = (data: string, mediaType: MediaType): Part => ({ type: "image", mediaType, data });

  return {
    analyzeText: (req) => json(AnalysisSchema, P.analyzeTextSystem(req), [text(P.analyzeTextUser(req))], 3000),

    lesson: (req) => {
      const parts = req.imageBase64 && req.mediaType
        ? [image(req.imageBase64, req.mediaType), text(P.lessonUser(req))]
        : [text(P.lessonUser(req))];
      return json(LessonSchema, P.lessonSystem(req), parts, 4000);
    },

    lessonStep: (req) => json(StepSchema, P.lessonStepSystem(req), [text(P.lessonStepUser(req))], 1200),

    analyzeImage: (req) =>
      json(ImageAnalysisSchema, P.IMAGE_SYSTEM, [image(req.imageBase64, req.mediaType), text("Explain this image.")], 2000),

    chat(req: ChatRequest) {
      const messages: BackendMessage[] = req.messages.map((m) => ({ role: m.role, parts: [text(m.content)] }));
      // Attach the image to the first user turn so the model can see what the student is asking about.
      if (req.context.type === "image" && req.context.imageBase64 && req.context.mediaType) {
        const first = messages.find((m) => m.role === "user");
        first?.parts.unshift(image(req.context.imageBase64, req.context.mediaType));
      }
      return backend.stream({ system: P.chatSystem(req.context), messages, maxTokens: 600 });
    },
  };
}
