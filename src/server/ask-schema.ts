import { z } from 'zod';

/**
 * Request body for POST /api/ask.
 * Length caps keep one request inside the model's context and the cost cap.
 */
export const askRequestSchema = z.object({
  question: z.string().trim().min(8).max(280),
});

/** A parsed ask request. */
export type AskRequest = z.infer<typeof askRequestSchema>;

/** One dataset the answer was drawn from. */
export const askCitationSchema = z.object({
  sourceId: z.string(),
  sourceName: z.string(),
  title: z.string(),
  url: z.string(),
});

/** A parsed ask citation. */
export type AskCitation = z.infer<typeof askCitationSchema>;

/** What one model call cost, and what produced it. */
export const askTelemetrySchema = z.object({
  model: z.string(),
  promptHash: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costUsd: z.number(),
  priced: z.boolean(),
  latencyMs: z.number().int(),
});

/** A parsed telemetry block. */
export type AskTelemetry = z.infer<typeof askTelemetrySchema>;

/** A source that could not be read, reported instead of hidden. */
export const askUnavailableSchema = z.object({
  sourceId: z.string(),
  message: z.string(),
});

/** Body of every POST /api/ask response. */
export const askResponseSchema = z.object({
  ok: z.literal(true),
  answer: z.string(),
  citations: z.array(askCitationSchema),
  unavailable: z.array(askUnavailableSchema),
  telemetry: askTelemetrySchema.nullable(),
  disabled: z.boolean(),
});
