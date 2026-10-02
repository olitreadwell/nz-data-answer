import { createDocument } from 'zod-openapi';
import { z } from 'zod';
import type { Simplify } from 'type-fest';
import { helloQuerySchema } from '@/server/hello-schema';
import { askRequestSchema, askResponseSchema } from '@/server/ask-schema';
import { contactFormSchema } from '@/server/contact-schema';
import { feedbackFormSchema } from '@/server/feedback-schema';

/**
 * Error envelope shared by every API route. The variants cover the shapes
 * produced by src/lib/errors.ts (validation details) and the route-level
 * guards (rate limit, proof-of-work, honeypot).
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  details: z.record(z.string(), z.array(z.string())).optional(),
  detail: z.string().optional(),
  challenge: z.string().optional(),
  retryAfter: z.number().optional(),
});

/** Body of a successful GET /api/hello response. */
export const helloResponseSchema = z.object({ message: z.string() });

/** Body of a successful GET /api/challenge response. */
export const challengeResponseSchema = z.object({
  challengeId: z.string(),
  noncePrefix: z.string(),
  difficulty: z.number().int(),
  expiresAt: z.number().int(),
});

/** Body of a successful POST /api/contact response. */
export const contactResponseSchema = z.object({
  ok: z.literal(true),
  delivered: z.enum(['smtp', 'fallback']),
  mailtoUrl: z.string().nullable(),
});

/** Body of a successful POST /api/feedback response. */
export const feedbackResponseSchema = z.object({
  ok: z.literal(true),
  url: z.string().optional(),
  disabled: z.boolean().optional(),
  message: z.string().optional(),
});

/** Body of a successful GET /health response. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
});

const jsonContent = (schema: z.ZodType) => ({
  content: { 'application/json': { schema } },
});

/**
 * OpenAPI 3.1 document for the app's own API routes. Generated from the
 * same zod schemas the routes validate against, so the spec cannot drift
 * from the server. Served at /api/openapi.json and rendered by Swagger UI
 * at /docs. Better Auth's /api/auth/* surface is framework-managed and
 * documented in docs/auth.md instead.
 */
export const openApiDocument: Simplify<ReturnType<typeof createDocument>> = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'NZ Data Answer API',
    version: '0.1.0',
    description:
      'Public API of NZ Data Answer: health, proof-of-work challenge, contact and feedback submission, and the ask endpoint that searches NZ open data and answers from the datasets it finds. Form submissions are gated by proof of work, per-IP rate limiting, and a honeypot (see docs/contact.md).',
  },
  servers: [{ url: '/' }],
  paths: {
    '/health': {
      get: {
        summary: 'Liveness check',
        description: 'Load balancers and orchestrators poll this endpoint.',
        responses: {
          '200': { description: 'Service is healthy', ...jsonContent(healthResponseSchema) },
        },
      },
    },
    '/api/hello': {
      get: {
        summary: 'Greet a name',
        description:
          'Demonstrates zod validation at the boundary: bad input never reaches business logic.',
        requestParams: { query: helloQuerySchema },
        responses: {
          '200': { description: 'Greeting', ...jsonContent(helloResponseSchema) },
          '400': { description: 'Invalid query', ...jsonContent(errorResponseSchema) },
        },
      },
    },
    '/api/ask': {
      post: {
        summary: 'Answer a question from NZ open data',
        description:
          'Searches the data.govt.nz catalogue and the Aotearoa Data Explorer for datasets matching the question, then answers from those excerpts alone. The response carries the citations, any source that failed, and the token and cost accounting for the model call. Rate limited to 10 questions per 5 minutes per IP.',
        requestBody: {
          content: { 'application/json': { schema: askRequestSchema } },
        },
        responses: {
          '200': { description: 'Answer, citations, and cost', ...jsonContent(askResponseSchema) },
          '400': { description: 'Invalid question', ...jsonContent(errorResponseSchema) },
          '429': { description: 'Rate limited', ...jsonContent(errorResponseSchema) },
        },
      },
    },
    '/api/challenge': {
      get: {
        summary: 'Issue a proof-of-work challenge',
        description:
          'Clients solve the challenge (sha256(noncePrefix + nonce) with difficulty leading zero hex digits) before submitting contact or feedback. Challenges expire after 5 minutes and are single-use.',
        responses: {
          '200': { description: 'Challenge to solve', ...jsonContent(challengeResponseSchema) },
        },
      },
    },
    '/api/contact': {
      post: {
        summary: 'Submit a contact message',
        description:
          'Validates the form, gates abuse (proof of work + rate limit + honeypot), then delivers by SMTP or answers with a mailto fallback. See docs/contact.md for the full contract.',
        requestBody: {
          content: { 'application/json': { schema: contactFormSchema } },
        },
        responses: {
          '200': { description: 'Message accepted', ...jsonContent(contactResponseSchema) },
          '400': {
            description: 'Validation, honeypot, or proof-of-work failure',
            ...jsonContent(errorResponseSchema),
          },
          '429': { description: 'Rate limited', ...jsonContent(errorResponseSchema) },
        },
      },
    },
    '/api/feedback': {
      post: {
        summary: 'Submit feedback',
        description:
          'Validates the form, gates abuse, then files a labelled GitHub issue when GH_TOKEN/GH_REPO are configured; otherwise answers disabled. See docs/contact.md for the full contract.',
        requestBody: {
          content: { 'application/json': { schema: feedbackFormSchema } },
        },
        responses: {
          '200': { description: 'Feedback accepted', ...jsonContent(feedbackResponseSchema) },
          '400': {
            description: 'Validation, honeypot, or proof-of-work failure',
            ...jsonContent(errorResponseSchema),
          },
          '429': { description: 'Rate limited', ...jsonContent(errorResponseSchema) },
        },
      },
    },
  },
});
