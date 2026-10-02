/**
 * The answer contract, enforced in code rather than requested in a prompt.
 *
 * A prompt is a suggestion to a model; a checker is not. Everything here
 * either rewrites what a model produced into the shape this product promises,
 * or reports the rule it broke. The prompt still asks for the same shape, and
 * the tests still measure it, because a rule that is only enforced after the
 * fact is a rule the model never gets better at.
 */

/** Longest answer the product shows, in words. */
export const MAX_ANSWER_WORDS = 120;

/**
 * Words that describe the plumbing rather than New Zealand.
 *
 * A person asked a question about public data. "The excerpts you provided"
 * tells them about the machinery instead of answering them.
 */
export const FORBIDDEN_ANSWER_PHRASES = [
  'excerpt',
  'supplied data',
  'supplied excerpts',
  'provided to me',
  'the data you provided',
  'as an ai',
  'language model',
  'system prompt',
];

/**
 * Rewrite a model answer into the shape the product promises.
 *
 * Removes markdown emphasis and headings, replaces em and en dashes, collapses
 * the text to one paragraph, and caps the length at a word boundary.
 *
 * @param answer - Raw model output
 * @param maxWords - Longest answer to keep, defaults to the product limit
 * @returns The answer as it will be shown
 */
export function enforceAnswerFormat(answer: string, maxWords = MAX_ANSWER_WORDS): string {
  let text = answer
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)\*(\S)/g, '$1$2')
    .replace(/—/g, ', ')
    .replace(/–/g, '-')
    // Drop the clause that talks about the plumbing, keeping the sentence
    // readable: "not provided in the excerpts" becomes "not provided".
    .replace(
      /\s+(?:in|from|by)\s+the\s+(?:supplied\s+|provided\s+)?(?:excerpts?|data|sources?|context)\b/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();

  const words = text.split(' ');
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ');
    text = /[.!?]$/.test(text) ? text : `${text.replace(/[,;:]$/, '')}.`;
  }
  return text;
}

/**
 * Report every product rule a finished answer breaks.
 *
 * @param answer - The answer as it will be shown
 * @param maxWords - Longest answer allowed, defaults to the product limit
 * @returns One message per broken rule, empty when the answer complies
 */
export function findAnswerViolations(answer: string, maxWords = MAX_ANSWER_WORDS): string[] {
  const violations: string[] = [];
  const lower = answer.toLowerCase();

  for (const phrase of FORBIDDEN_ANSWER_PHRASES) {
    if (lower.includes(phrase)) violations.push(`mentions internal vocabulary: ${phrase}`);
  }
  if (/—|–/.test(answer)) violations.push('contains a long dash');
  if (/\*\*|^#{1,6}\s|`/.test(answer)) violations.push('contains markdown formatting');
  if (answer.split(/\s+/).filter(Boolean).length > maxWords) {
    violations.push(`longer than ${maxWords} words`);
  }
  if (/\n/.test(answer.trim())) violations.push('contains more than one paragraph');
  if (/\b(LEED|AGR|NZSIOC)_?[A-Z0-9_]*\b/.test(answer)) {
    violations.push('contains a raw table identifier');
  }
  return violations;
}
