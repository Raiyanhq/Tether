import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import {
  AnalysisSchema, LessonSchema, StepSchema, ImageAnalysisSchema,
  type ChatRequest,
} from "./schemas.js";
import * as P from "./prompts.js";
import { BadModelOutputError, type Llm } from "./llm.js";

type ImageBlock = { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp"; data: string } };
type Content = string | Array<ImageBlock | { type: "text"; text: string }>;

/** Pull a JSON object out of a model reply, tolerating code fences and stray prose. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(body.slice(start, end + 1));
}

export function createAnthropicLlm(opts: { apiKey: string; model: string; baseURL?: string }): Llm {
  const client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseURL });
  const model = opts.model;

  async function text(system: string, content: Content, maxTokens: number): Promise<string> {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    });
    return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }

  // Validate against the schema; retry once on malformed output, then give up with a real error.
  async function json<S extends z.ZodTypeAny>(
    schema: S, system: string, content: Content, maxTokens: number
  ): Promise<z.output<S>> {
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const sys = attempt === 0 ? system : `${system}\n\nYour previous reply was not valid. Reply with ONLY the JSON object, matching the shape exactly.`;
      const raw = await text(sys, content, maxTokens);
      try {
        return schema.parse(extractJson(raw));
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new BadModelOutputError(lastError);
  }

  const img = (b64: string, mt: ImageBlock["source"]["media_type"]): ImageBlock => ({
    type: "image",
    source: { type: "base64", media_type: mt, data: b64 },
  });

  return {
    analyzeText: (req) => json(AnalysisSchema, P.analyzeTextSystem(req), P.analyzeTextUser(req), 3000),

    lesson: (req) => {
      const content: Content = req.imageBase64 && req.mediaType
        ? [img(req.imageBase64, req.mediaType), { type: "text", text: P.lessonUser(req) }]
        : P.lessonUser(req);
      return json(LessonSchema, P.lessonSystem(req), content, 4000);
    },

    lessonStep: (req) => json(StepSchema, P.lessonStepSystem(req), P.lessonStepUser(req), 1200),

    analyzeImage: (req) =>
      json(ImageAnalysisSchema, P.IMAGE_SYSTEM, [img(req.imageBase64, req.mediaType), { type: "text", text: "Explain this image." }], 2000),

    async *chat(req: ChatRequest) {
      const messages: Anthropic.MessageParam[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
      // Attach the image to the first user turn so the model can see what the student is asking about.
      if (req.context.type === "image" && req.context.imageBase64 && req.context.mediaType) {
        const first = messages.findIndex((m) => m.role === "user");
        if (first >= 0) {
          messages[first] = {
            role: "user",
            content: [img(req.context.imageBase64, req.context.mediaType), { type: "text", text: String(messages[first].content) }],
          };
        }
      }
      const stream = client.messages.stream({
        model,
        max_tokens: 600,
        system: P.chatSystem(req.context),
        messages,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
      }
    },
  };
}
