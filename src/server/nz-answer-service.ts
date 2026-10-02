/**
 * One question in, one cited answer out.
 *
 * The order matters: search first, stop early when there is nothing to cite,
 * and only then spend a model call. A question the sources cannot answer
 * costs nothing, which is the behaviour a per-request cost cap is meant to
 * protect once traffic arrives.
 */

import { isAiConfigured, readAiConfig } from '@/lib/ai/aiConfig';
import { createAiClient, type AiClient } from '@/lib/ai/aiClient';
import { findPromptInjectionSignals } from '@/lib/ai/aiGuard';
import { logger } from '@/lib/logger';
import { nzAnswerPrompt } from '@/server/nz-answer-prompt';
import { searchNzSources, type NzSourceFailure } from '@/server/nz-source-search';
import type { AskCitation, AskTelemetry } from '@/server/ask-schema';

/** What one question produced. */
export interface NzAnswerResult {
  answer: string;
  citations: AskCitation[];
  unavailable: NzSourceFailure[];
  telemetry: AskTelemetry | null;
  disabled: boolean;
}

/** Injectable collaborators, so tests never touch the network. */
export interface NzAnswerOptions {
  fetchImpl?: typeof globalThis.fetch;
  client?: AiClient;
  now?: () => number;
}

/** Said when the sources were reachable but held nothing relevant. */
export const NZ_ANSWER_NO_MATCH =
  'No datasets in the data.govt.nz catalogue or the Aotearoa Data Explorer matched that question. Try a broader phrase, or a named topic such as "sheep", "earthquake" or "median earnings".';

/** Said when the deployment has no model configured. */
export const NZ_ANSWER_DISABLED =
  'AI answers are disabled on this deployment. The datasets below are still the live search result for your question; set AI_API_KEY to turn the answer on.';

/**
 * Turn a source excerpt into a citation a reader can follow.
 *
 * @param excerpt - One dataset offered as evidence
 * @returns The citation shape the API returns
 */
export function toAskCitation(excerpt: {
  sourceId: string;
  sourceName: string;
  title: string;
  url: string;
}): AskCitation {
  return {
    sourceId: excerpt.sourceId,
    sourceName: excerpt.sourceName,
    title: excerpt.title,
    url: excerpt.url,
  };
}

/**
 * Answer one question about NZ public data, with citations and cost.
 *
 * @param question - The user's question, already validated
 * @param options - Injectable fetch, client, and clock
 * @returns The answer, the datasets behind it, and what the call cost
 */
export async function answerNzDataQuestion(
  question: string,
  options: NzAnswerOptions = {}
): Promise<NzAnswerResult> {
  const outcome = await searchNzSources(question, options.fetchImpl);
  const citations = outcome.excerpts.map(toAskCitation);

  if (outcome.excerpts.length === 0) {
    return {
      answer: NZ_ANSWER_NO_MATCH,
      citations,
      unavailable: outcome.failures,
      telemetry: null,
      disabled: false,
    };
  }

  if (!options.client && !isAiConfigured()) {
    return {
      answer: NZ_ANSWER_DISABLED,
      citations,
      unavailable: outcome.failures,
      telemetry: null,
      disabled: true,
    };
  }

  const signals = outcome.excerpts.flatMap((excerpt) =>
    findPromptInjectionSignals(`${excerpt.title}\n${excerpt.summary}`)
  );
  if (signals.length > 0) {
    logger.warn({ signals, question }, 'prompt injection signals in source excerpts');
  }

  const client = options.client ?? createAiClient(readAiConfig());
  const startedAt = options.now?.() ?? Date.now();
  const completion = await client.generateText({
    system: nzAnswerPrompt.system,
    prompt: nzAnswerPrompt.render({ question, excerpts: outcome.excerpts }),
    promptHash: nzAnswerPrompt.hash,
  });

  return {
    answer: completion.value.trim(),
    citations,
    unavailable: outcome.failures,
    telemetry: {
      model: completion.model,
      promptHash: completion.promptHash ?? nzAnswerPrompt.hash,
      inputTokens: completion.usage.inputTokens,
      outputTokens: completion.usage.outputTokens,
      costUsd: completion.cost.usd,
      priced: completion.cost.priced,
      latencyMs: completion.latencyMs || (options.now?.() ?? Date.now()) - startedAt,
    },
    disabled: false,
  };
}
