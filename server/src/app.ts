import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  AnalyzeImageRequestSchema, AnalyzeTextRequestSchema, ChatRequestSchema,
  LessonRequestSchema, LessonStepRequestSchema, MAX_TEXT_CHARS,
  type Lesson,
} from "./schemas.js";
import { BadModelOutputError, type Llm } from "./llm.js";

export interface AppOptions {
  llm: Llm;
  allowedOrigins: string[];
  rateLimitPerMinute?: number;
  /** Set when running behind a reverse proxy (Render, Fly, nginx) so rate limiting sees real client IPs. */
  trustProxy?: boolean;
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// The proxy forwards and forgets: no request text is ever logged or stored.
export function createApp({ llm, allowedOrigins, rateLimitPerMinute = 60, trustProxy = false }: AppOptions) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new HttpError(403, "forbidden_origin", "Origin not allowed"));
      },
    })
  );

  // Locked to the extension: browser requests must carry an allowed Origin. Health check is open.
  app.use((req, _res, next) => {
    if (req.path === "/health" || req.path === "/") return next();
    const origin = req.headers.origin;
    if (!origin || !allowedOrigins.includes(origin)) {
      return next(new HttpError(403, "forbidden_origin", "Origin not allowed"));
    }
    next();
  });

  app.use(express.json({ limit: "12mb" }));
  app.use(rateLimit({
    windowMs: 60_000,
    limit: rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "rate_limited", "Too many requests. Try again in a minute.")),
  }));

  app.get("/health", (_req, res) => { res.json({ ok: true }); });
  app.get("/", (_req, res) => {
    res.type("text/plain").send("Tether server is running. The /api routes only answer the Tether extension.\n");
  });

  const route = <T extends z.ZodTypeAny>(schema: T, fn: (body: z.output<T>) => Promise<unknown>) =>
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsed = schema.safeParse(req.body);
        if (!parsed.success) {
          throw new HttpError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        }
        res.json(await fn(parsed.data));
      } catch (e) {
        next(e);
      }
    };

  app.post("/api/analyze-text", route(AnalyzeTextRequestSchema, async (req) => {
    if (req.text.length > MAX_TEXT_CHARS) {
      throw new HttpError(413, "text_too_long", `That is too long. Select about ${MAX_TEXT_CHARS} characters or fewer.`);
    }
    const out = await llm.analyzeText(req);
    // Keep only terms that really appear in the passage, so underlining always has something to match.
    const lower = req.text.toLowerCase();
    out.terms = out.terms.filter((t) => lower.includes(t.term.toLowerCase()));
    return out;
  }));

  app.post("/api/lesson", route(LessonRequestSchema, async (req) => {
    const lesson = await llm.lesson(req);
    return cleanLesson(lesson);
  }));

  app.post("/api/lesson-step", route(LessonStepRequestSchema, async (req) => {
    if (!req.lesson.steps.some((s) => s.id === req.stepId)) {
      throw new HttpError(400, "bad_request", `Unknown stepId ${req.stepId}`);
    }
    const step = await llm.lessonStep(req);
    return { ...step, id: req.stepId };
  }));

  app.post("/api/analyze-image", route(AnalyzeImageRequestSchema, (req) => llm.analyzeImage(req)));

  app.post("/api/chat", async (req, res, next) => {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(new HttpError(400, "bad_request", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")));
    }
    // Pull the first chunk before committing to a stream, so early failures can still be a normal JSON error.
    const iter = llm.chat(parsed.data)[Symbol.asyncIterator]();
    try {
      let first = await iter.next();
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      while (!first.done) {
        res.write(`data: ${JSON.stringify({ delta: first.value })}\n\n`);
        first = await iter.next();
      }
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (e) {
      if (!res.headersSent) return next(e);
      res.write(`data: ${JSON.stringify({ error: "The answer was cut off. Please try again." })}\n\n`);
      res.end();
    }
  });

  app.use((_req, _res, next) => next(new HttpError(404, "not_found", "Not found")));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; type?: string; code?: string; message?: string };
    let status = 500, code = "internal", message = "Something went wrong on the server.";
    if (err instanceof HttpError) { status = err.status; code = err.code; message = err.message; }
    else if (e?.type === "entity.too.large") { status = 413; code = "payload_too_large"; message = "That upload is too large."; }
    else if (e?.type === "entity.parse.failed") { status = 400; code = "bad_request"; message = "Request body is not valid JSON."; }
    else if (err instanceof BadModelOutputError) { status = 502; code = "bad_model_output"; message = "The AI reply was malformed twice. Please try again."; }
    else if (typeof e?.status === "number") {
      status = 502; code = "upstream"; message = "The AI service had a problem. Please try again.";
      console.error(`upstream error: provider returned ${e.status}`); // status only, never request text
    }
    if (!res.headersSent) res.status(status).json({ error: { code, message } });
  });

  return app;
}

/** Drop refs that point to missing or later steps and make sure ids are unique. */
function cleanLesson(lesson: Lesson): Lesson {
  const seen = new Set<string>();
  const steps = lesson.steps.map((s, i) => {
    const id = seen.has(s.id) ? `s${i + 1}` : s.id;
    const refs = s.visual.refs.filter((r) => seen.has(r));
    seen.add(id);
    return { ...s, id, visual: { ...s.visual, refs } };
  });
  return { ...lesson, steps };
}
