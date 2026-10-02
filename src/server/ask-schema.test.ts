import { describe, expect, it } from 'vitest';
import { askRequestSchema } from '@/server/ask-schema';

describe('askRequestSchema', () => {
  it('accepts a question and trims it', () => {
    const parsed = askRequestSchema.parse({ question: '  How many sheep?  ' });
    expect(parsed.question).toBe('How many sheep?');
  });

  it('rejects a question shorter than eight characters', () => {
    expect(askRequestSchema.safeParse({ question: 'sheep' }).success).toBe(false);
  });

  it('rejects a question longer than 280 characters', () => {
    expect(askRequestSchema.safeParse({ question: 'a'.repeat(281) }).success).toBe(false);
  });

  it('rejects a missing question', () => {
    expect(askRequestSchema.safeParse({}).success).toBe(false);
  });
});
