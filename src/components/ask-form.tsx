'use client';

import { useState } from 'react';
import type { AskCitation, AskTelemetry } from '@/server/ask-schema';

interface AskUnavailable {
  sourceId: string;
  message: string;
}

interface AskState {
  status: 'idle' | 'loading' | 'done' | 'error';
  answer: string;
  citations: AskCitation[];
  unavailable: AskUnavailable[];
  telemetry: AskTelemetry | null;
  disabled: boolean;
  message: string;
}

const initialState: AskState = {
  status: 'idle',
  answer: '',
  citations: [],
  unavailable: [],
  telemetry: null,
  disabled: false,
  message: '',
};

/**
 * Ask one question about NZ public data and render the cited answer.
 *
 * @returns The question form, the answer, and the evidence behind it
 */
export function AskForm() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AskState>(initialState);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ ...initialState, status: 'loading' });
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const body = await response.json();
      if (!response.ok) {
        setState({
          ...initialState,
          status: 'error',
          message:
            response.status === 429
              ? 'Too many questions for now. Try again in a few minutes.'
              : 'That question could not be answered. Try rewording it.',
        });
        return;
      }
      setState({
        status: 'done',
        answer: body.answer ?? '',
        citations: body.citations ?? [],
        unavailable: body.unavailable ?? [],
        telemetry: body.telemetry ?? null,
        disabled: Boolean(body.disabled),
        message: '',
      });
    } catch {
      setState({
        ...initialState,
        status: 'error',
        message: 'The request did not reach the server.',
      });
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor="ask-question">
          Your question
        </label>
        <input
          id="ask-question"
          className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900"
          name="question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="How many sheep does New Zealand have?"
          minLength={8}
          maxLength={280}
          required
        />
        <button
          className="self-start rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          type="submit"
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? 'Searching and answering...' : 'Ask'}
        </button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {state.status === 'error' ? (
          <p className="text-red-700 dark:text-red-400">{state.message}</p>
        ) : null}

        {state.status === 'done' ? (
          <article className="flex flex-col gap-4">
            <p className="whitespace-pre-line text-lg leading-relaxed">{state.answer}</p>

            {state.citations.length > 0 ? (
              <div>
                <h2 className="text-sm font-semibold">Datasets behind this answer</h2>
                <ul className="mt-2 flex flex-col gap-2">
                  {state.citations.map((citation) => (
                    <li key={`${citation.sourceId}-${citation.title}`} className="text-sm">
                      <a
                        className="text-blue-700 underline dark:text-blue-400"
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {citation.title}
                      </a>{' '}
                      <span className="text-neutral-600 dark:text-neutral-400">
                        via {citation.sourceName}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {state.unavailable.length > 0 ? (
              <p className="text-sm text-amber-800 dark:text-amber-400">
                {state.unavailable.map((failure) => failure.sourceId).join(', ')} did not answer, so
                this answer used the sources that did.
              </p>
            ) : null}

            {state.telemetry ? (
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                <div className="flex gap-1">
                  <dt>Model</dt>
                  <dd>{state.telemetry.model}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Prompt</dt>
                  <dd>{state.telemetry.promptHash}</dd>
                </div>
                <div className="flex gap-1">
                  <dt>Tokens</dt>
                  <dd>
                    {state.telemetry.inputTokens} in / {state.telemetry.outputTokens} out
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Cost</dt>
                  <dd>
                    {state.telemetry.priced
                      ? `$${state.telemetry.costUsd.toFixed(5)}`
                      : 'unpriced model'}
                  </dd>
                </div>
                <div className="flex gap-1">
                  <dt>Latency</dt>
                  <dd>{state.telemetry.latencyMs} ms</dd>
                </div>
              </dl>
            ) : null}
          </article>
        ) : null}
      </div>
    </section>
  );
}
