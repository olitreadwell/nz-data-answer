import { describe, expect, it } from 'vitest';
import {
  MAX_ANSWER_WORDS,
  enforceAnswerFormat,
  findAnswerViolations,
} from '@/server/answer-constraints';

// The answer the live site produced before the contract moved into code. It
// broke five of the product's rules at once, which is why it is the fixture.
const REJECTED_ANSWER =
  'The excerpts you provided list three datasets—**"Table 1.6: Main earnings source, by industry ' +
  '(NZSIOC)", "Geographic units by area (TA and RC) and industry 2000-2025", and "Livestock ' +
  'Numbers by Regional Council"**—but they contain only titles, URLs and dimension descriptions. ' +
  'None of them include the actual livestock counts, so the number of sheep in New Zealand is not ' +
  'available from the supplied data.';

describe('enforceAnswerFormat', () => {
  it('removes markdown emphasis, headings and bullets', () => {
    expect(enforceAnswerFormat('## Heading\n- **Bold** point')).toBe('Heading Bold point');
  });

  it('replaces long dashes', () => {
    expect(enforceAnswerFormat('sheep—and beef')).toBe('sheep, and beef');
    expect(enforceAnswerFormat('2000–2025')).toBe('2000-2025');
  });

  it('collapses to one paragraph', () => {
    expect(enforceAnswerFormat('One line.\n\nSecond   line.')).toBe('One line. Second line.');
  });

  it('caps the length at a word boundary and closes the sentence', () => {
    const long = Array.from({ length: MAX_ANSWER_WORDS + 40 }, () => 'word').join(' ');
    const trimmed = enforceAnswerFormat(long);
    expect(trimmed.split(' ').length).toBe(MAX_ANSWER_WORDS);
    expect(trimmed.endsWith('.')).toBe(true);
  });

  it('leaves a compliant answer untouched', () => {
    const good =
      'New Zealand had 23.3 million sheep in 2026, according to the Livestock Numbers by Regional Council table.';
    expect(enforceAnswerFormat(good)).toBe(good);
  });

  it('removes the clause that describes where the information came from', () => {
    expect(
      enforceAnswerFormat(
        'The number of sheep is not provided in the excerpts. Nothing else applies.'
      )
    ).toBe('The number of sheep is not provided. Nothing else applies.');
    expect(
      enforceAnswerFormat('The median annual earnings are not available from the supplied data.')
    ).toBe('The median annual earnings are not available.');
  });

  it('leaves a sentence about New Zealand data alone', () => {
    const good = 'The data comes from Stats NZ and covers every region.';
    expect(enforceAnswerFormat(good)).toBe(good);
  });
});

describe('findAnswerViolations', () => {
  it('names every rule the rejected answer broke', () => {
    const violations = findAnswerViolations(REJECTED_ANSWER);
    expect(violations).toContain('mentions internal vocabulary: excerpt');
    expect(violations).toContain('mentions internal vocabulary: supplied data');
    expect(violations).toContain('contains a long dash');
    expect(violations).toContain('contains markdown formatting');
    expect(violations).toContain('contains a raw table identifier');
  });

  it('passes an answer that obeys the contract', () => {
    const good =
      'New Zealand had 23.3 million sheep in 2026, down from 49.5 million in 1994, according to the Livestock Numbers by Regional Council table published by Stats NZ.';
    expect(findAnswerViolations(good)).toEqual([]);
  });

  it('rejects a raw table identifier', () => {
    expect(findAnswerViolations('See table LEED_AP1_002 for the figures.')).toContain(
      'contains a raw table identifier'
    );
  });

  it('rejects an answer over the word limit', () => {
    const long = Array.from({ length: MAX_ANSWER_WORDS + 1 }, () => 'word').join(' ');
    expect(findAnswerViolations(long)).toContain(`longer than ${MAX_ANSWER_WORDS} words`);
  });
});
