import { describe, expect, it } from 'vitest';
import { AiCallError } from '@/lib/ai/aiClient';
import { AiBudgetError } from '@/lib/ai/aiGuard';
import { AppError, toErrorResponse } from '@/lib/errors';

describe('toErrorResponse', () => {
  it('maps AppError to its status', async () => {
    const response = toErrorResponse(new AppError('nope', 400));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'nope' });
  });

  it('maps unknown errors to 500', async () => {
    const response = toErrorResponse(new Error('boom'));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal_error' });
  });

  it('maps an AI budget error to 429 without leaking the cap', async () => {
    const response = toErrorResponse(new AiBudgetError('over the cap'));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: 'ai_budget_exceeded' });
  });

  it('maps a provider failure to 502 without leaking the provider body', async () => {
    const response = toErrorResponse(new AiCallError('provider responded 500', 500));
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'ai_unavailable' });
  });
});
