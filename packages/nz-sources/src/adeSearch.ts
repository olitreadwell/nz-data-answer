import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One ADE table found by the Aotearoa Data Explorer search index. */
export interface AdeDataflow {
  dataflowId: string;
  version: string;
  agencyId: string;
  name: string;
  dimensions: string[];
}

/** Aotearoa Data Explorer search results. */
export interface AdeSearchResult {
  numFound: number;
  dataflows: AdeDataflow[];
}

const ADE_DATAFLOW_SCHEMA = z.object({
  dataflowId: z.string(),
  version: z.string().optional().default(''),
  agencyId: z.string().optional().default(''),
  name: z.string().optional().default(''),
  dimensions: z.array(z.string()).optional().default([]),
});

const ADE_SEARCH_RESPONSE_SCHEMA = z.object({
  numFound: z.number(),
  dataflows: z.array(ADE_DATAFLOW_SCHEMA).optional().default([]),
});

/** Parses an ADE search index payload into dataflow records. */
export function parseAdeSearchResults(payload: unknown): AdeSearchResult {
  const parsed = ADE_SEARCH_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('ADE search', parsed.error.message);
  }
  return {
    numFound: parsed.data.numFound,
    dataflows: parsed.data.dataflows.map((flow) => ({
      dataflowId: flow.dataflowId,
      version: flow.version,
      agencyId: flow.agencyId,
      name: flow.name,
      dimensions: flow.dimensions,
    })),
  };
}

/**
 * Searches the Aotearoa Data Explorer table index by keyword. Keyless.
 * Falls back to a committed fixture when the API is unreachable.
 */
export async function searchAdeTables(
  query: string,
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<AdeSearchResult> {
  const limit = options.limit ?? 20;
  const url =
    `https://explore.data.stats.govt.nz/sfs/api/search?tenant=public` +
    `&q=${encodeURIComponent(query)}&limit=${limit}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('ADE search', `HTTP ${response.status}`);
  }
  return parseAdeSearchResults(await response.json());
}

/**
 * Aotearoa Data Explorer search adapter: finds ADE table IDs by keyword.
 * Keyless. The live probe searches for median annual earnings (LEED).
 */
export const adeSearchAdapter: NzDataAdapter<AdeSearchResult> = {
  id: 'ade-search',
  name: 'Aotearoa Data Explorer search index',
  auth: 'none',
  description: 'Searches ADE table IDs and titles by keyword.',
  fetchLive: (options) =>
    searchAdeTables('median annual earnings', {
      limit: 5,
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseAdeSearchResults,
  loadFixture: () => parseAdeSearchResults(readFixtureJson('ade-search-earnings.json')),
};
