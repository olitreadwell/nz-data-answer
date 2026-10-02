/**
 * Candidate datasets for a question, pulled from the vendored NZ open data
 * connectors.
 *
 * Two keyless sources cover the question "what does Aotearoa New Zealand
 * publish about this": the national catalogue at data.govt.nz and the
 * Aotearoa Data Explorer table index. Both are searched in parallel, and a
 * source that fails is reported rather than silently dropped, because an
 * answer built on half the candidates should say so.
 */

import { searchAdeTables, searchDataGovtNzDatasets } from '@nz-open-data-connectors/nz-sources';
import { logger } from '@/lib/logger';

/** One dataset offered to the model as evidence. */
export interface NzSourceExcerpt {
  /** Connector id, e.g. "data-govt-nz". */
  sourceId: string;
  /** Human-readable source name. */
  sourceName: string;
  /** Dataset or table title as published. */
  title: string;
  /** Where a reader can see the original. */
  url: string;
  /** Trimmed description, capped so eight excerpts still fit one prompt. */
  summary: string;
}

/** A source that could not be read for this question. */
export interface NzSourceFailure {
  sourceId: string;
  message: string;
}

/** Everything the search found, and everything it could not. */
export interface NzSourceSearchOutcome {
  excerpts: NzSourceExcerpt[];
  failures: NzSourceFailure[];
}

/** How many excerpts one prompt may carry. */
export const MAX_NZ_SOURCE_EXCERPTS = 8;

/** Longest description kept per excerpt, in characters. */
export const MAX_NZ_SOURCE_SUMMARY_LENGTH = 240;

/** How many terms one catalogue query may carry. */
export const MAX_NZ_SOURCE_QUERY_TERMS = 6;

/**
 * Identifies this app to the public APIs it reads.
 *
 * The data.govt.nz catalogue answers a plain server-side fetch from a cloud
 * region with an HTML holding page, and naming the client is the polite half
 * of asking for the API instead. The failures are still reported on the page
 * when a source refuses.
 */
export const NZ_SOURCE_USER_AGENT =
  'nz-data-answer/0.1.0 (+https://github.com/olitreadwell/nz-data-answer)';

/**
 * Wrap a fetch so every connector request carries this app's user agent.
 *
 * @param fetchImpl - The fetch to wrap
 * @returns A fetch that adds the `user-agent` header
 */
export function withNzSourceUserAgent(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchImpl(input, {
      ...init,
      headers: { ...(init?.headers ?? {}), 'user-agent': NZ_SOURCE_USER_AGENT },
    })) as typeof globalThis.fetch;
}

// Catalogue search is keyword matching, not question answering: leaving the
// sentence intact returns datasets that merely share its stopwords.
const QUERY_STOPWORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'are',
  'at',
  'be',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'for',
  'from',
  'give',
  'has',
  'have',
  'how',
  'in',
  'is',
  'it',
  'its',
  'list',
  'many',
  'me',
  'much',
  'of',
  'on',
  'or',
  'please',
  'show',
  'tell',
  'that',
  'the',
  'there',
  'this',
  'to',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'with',
  'would',
]);

// The national catalogue matches any of its terms, so a location word that
// appears in most of its titles swamps the distinctive ones. Searching
// "sheep new zealand" returns 16,489 datasets ranked by "New Zealand";
// searching "sheep" returns 31 ranked by sheep. The Explorer's index handles
// the longer query, so only the catalogue query is narrowed.
const CATALOGUE_NOISE_TERMS = new Set(['new', 'zealand', 'nz', 'aotearoa']);

/**
 * Turn a question into a keyword query the catalogue can actually match.
 *
 * @param question - The user's question in full
 * @param dropNoiseTerms - Also drop words that appear in most NZ titles
 * @returns Up to six meaningful terms, or the trimmed question when nothing is left
 */
export function buildNzSourceQuery(question: string, dropNoiseTerms = false): string {
  const terms = question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !QUERY_STOPWORDS.has(term))
    .filter((term) => !dropNoiseTerms || !CATALOGUE_NOISE_TERMS.has(term));
  if (terms.length === 0) return question.trim();
  return terms.slice(0, MAX_NZ_SOURCE_QUERY_TERMS).join(' ');
}

/**
 * Interleave two ranked lists so one source cannot fill every slot.
 *
 * @param first - Excerpts from the first source, best first
 * @param second - Excerpts from the second source, best first
 * @returns Alternating excerpts, starting with the first source
 */
function interleaveExcerpts(
  first: NzSourceExcerpt[],
  second: NzSourceExcerpt[]
): NzSourceExcerpt[] {
  const merged: NzSourceExcerpt[] = [];
  const longest = Math.max(first.length, second.length);
  for (let index = 0; index < longest; index += 1) {
    const fromFirst = first[index];
    const fromSecond = second[index];
    if (fromFirst) merged.push(fromFirst);
    if (fromSecond) merged.push(fromSecond);
  }
  return merged;
}

/**
 * Collapse a published description into one short line.
 *
 * @param notes - Raw description, possibly HTML or many paragraphs
 * @param limit - Longest string to keep
 * @returns Single-line text, truncated on a word boundary
 */
export function summariseSourceNotes(notes: string, limit = MAX_NZ_SOURCE_SUMMARY_LENGTH): string {
  const flat = notes
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= limit) return flat;
  const clipped = flat.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}...`;
}

/**
 * Search the NZ open data connectors for datasets matching a question.
 *
 * @param question - The user's question, used as the search query
 * @param fetchImpl - Injectable fetch, so tests never touch the network
 * @returns Excerpts worth putting in a prompt, plus any source failures
 */
export async function searchNzSources(
  question: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<NzSourceSearchOutcome> {
  const excerpts: NzSourceExcerpt[] = [];
  const failures: NzSourceFailure[] = [];
  const catalogueExcerpts: NzSourceExcerpt[] = [];
  const explorerExcerpts: NzSourceExcerpt[] = [];

  const connectorFetch = withNzSourceUserAgent(fetchImpl);

  const [catalogue, explorer] = await Promise.allSettled([
    searchDataGovtNzDatasets(buildNzSourceQuery(question, true), connectorFetch),
    searchAdeTables(buildNzSourceQuery(question), { limit: 10, fetchImpl: connectorFetch }),
  ]);

  if (catalogue.status === 'fulfilled') {
    for (const dataset of catalogue.value.datasets) {
      catalogueExcerpts.push({
        sourceId: 'data-govt-nz',
        sourceName: 'data.govt.nz catalogue',
        title: dataset.title,
        url: dataset.url || `https://catalogue.data.govt.nz/dataset/${dataset.name}`,
        summary: summariseSourceNotes(dataset.notes),
      });
    }
  } else {
    failures.push({ sourceId: 'data-govt-nz', message: String(catalogue.reason) });
  }

  if (explorer.status === 'fulfilled') {
    for (const dataflow of explorer.value.dataflows) {
      explorerExcerpts.push({
        sourceId: 'ade-search',
        sourceName: 'Aotearoa Data Explorer',
        title: dataflow.name || dataflow.dataflowId,
        url: 'https://explore.data.stats.govt.nz/',
        summary:
          summariseSourceNotes(dataflow.dataflowId) +
          (dataflow.dimensions.length > 0 ? ` Dimensions: ${dataflow.dimensions.join(', ')}` : ''),
      });
    }
  } else {
    failures.push({ sourceId: 'ade-search', message: String(explorer.reason) });
  }

  if (failures.length > 0) {
    logger.warn({ failures }, 'nz source search had failures');
  }

  excerpts.push(...interleaveExcerpts(catalogueExcerpts, explorerExcerpts));
  return { excerpts: excerpts.slice(0, MAX_NZ_SOURCE_EXCERPTS), failures };
}
