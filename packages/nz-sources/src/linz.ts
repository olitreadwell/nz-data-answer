import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One layer found by the LINZ Data Service catalogue search. */
export interface LinzLayer {
  id: number;
  title: string;
  url: string;
}

const LINZ_LAYER_SCHEMA = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string().optional().default(''),
});

const LINZ_SEARCH_RESPONSE_SCHEMA = z.array(LINZ_LAYER_SCHEMA);

/** Parses a LINZ Data Service layer search payload into layers. */
export function parseLinzLayers(payload: unknown): LinzLayer[] {
  const parsed = LINZ_SEARCH_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('LINZ', parsed.error.message);
  }
  return parsed.data.map((layer) => ({
    id: layer.id,
    title: layer.title,
    url: layer.url,
  }));
}

/**
 * Searches the LINZ Data Service catalogue for layers (e.g. "property
 * titles"). Works keyless for the catalogue; an API key is sent when
 * provided. Falls back to a committed fixture when the API is unreachable.
 */
export async function searchLinzLayers(
  query: string,
  options: { apiKey?: string; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<LinzLayer[]> {
  const url = `https://data.linz.govt.nz/services/api/v1/layers?search=${encodeURIComponent(query)}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url, {
    ...(options.apiKey === undefined ? {} : { headers: { 'x-api-key': options.apiKey } }),
  });
  if (!response.ok) {
    throw new NzSourceApiError('LINZ', `HTTP ${response.status}`);
  }
  return parseLinzLayers(await response.json());
}

/** LINZ adapter: catalogue layer search, keyless. */
export const linzAdapter: NzDataAdapter<LinzLayer[]> = {
  id: 'linz',
  name: 'LINZ Data Service catalogue',
  auth: 'none',
  description: 'Searches LINZ layers (property titles, parcels, boundaries).',
  fetchLive: (options) =>
    searchLinzLayers('property', {
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseLinzLayers,
  loadFixture: () => parseLinzLayers(readFixtureJson('linz-layer-search.json')),
};
