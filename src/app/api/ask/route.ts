import { AppError, toErrorResponse } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { FixedWindowRateLimiter, getClientIp } from '@/lib/rate-limit';
import { askRequestSchema, askResponseSchema } from '@/server/ask-schema';
import { answerNzDataQuestion } from '@/server/nz-answer-service';

// Ten questions per five minutes per IP. The model call is the expensive part,
// so the limit sits in front of validation rather than behind it.
const askRateLimiter = new FixedWindowRateLimiter(10, 5 * 60 * 1000);
const RATE_LIMIT_RETRY_SECONDS = 300;

/**
 * Search NZ open data for relevant datasets and answer the question from them.
 *
 * @param request - Incoming request with a JSON body of { question }
 * @returns The answer, its citations, and the cost of the model call
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!askRateLimiter.allow(getClientIp(request))) {
      return Response.json(
        { error: 'rate_limited', retryAfter: RATE_LIMIT_RETRY_SECONDS },
        { status: 429, headers: { 'Retry-After': String(RATE_LIMIT_RETRY_SECONDS) } }
      );
    }

    const body = await request.json().catch(() => {
      throw new AppError('invalid_json', 400);
    });
    const parsed = askRequestSchema.safeParse(body);
    if (!parsed.success) return toErrorResponse(parsed.error);

    const result = await answerNzDataQuestion(parsed.data.question);
    logger.info(
      {
        citations: result.citations.length,
        unavailable: result.unavailable.length,
        disabled: result.disabled,
        ...result.telemetry,
      },
      'nz data question answered'
    );
    return Response.json(askResponseSchema.parse({ ok: true, ...result }));
  } catch (error) {
    return toErrorResponse(error);
  }
}
