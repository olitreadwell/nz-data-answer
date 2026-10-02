import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One layer in the LRIS (Landcare Research) catalogue. */
export interface LrisLayer {
  id: number;
  title: string;
  url: string;
  publicAccess: string;
}

const LRIS_LAYER_SCHEMA = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  public_access: z.string().optional().default(''),
});

const LRIS_SEARCH_RESPONSE_SCHEMA = z.array(LRIS_LAYER_SCHEMA);

/**
 * Parses an LRIS layer search payload into layers.
 *
 * @param payload - Raw LRIS layer search JSON.
 * @returns Layer records with id, title, url, and public access.
 */
export function parseLrisLayers(payload: unknown): LrisLayer[] {
  const parsed = LRIS_SEARCH_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('LRIS', parsed.error.message);
  }
  return parsed.data.map((layer) => ({
    id: layer.id,
    title: layer.title,
    url: layer.url,
    publicAccess: layer.public_access,
  }));
}

/**
 * Searches the LRIS (Landcare Research) catalogue for layers (e.g. "soil").
 * Keyless; falls back to a committed fixture when the API is unreachable.
 *
 * @param query - Layer search text, e.g. "soil".
 * @param fetchImpl - Fetch implementation override for tests.
 * @returns Layer records matching the query.
 */
export async function searchLrisLayers(
  query: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<LrisLayer[]> {
  const url = `https://lris.scinfo.org.nz/services/api/v1/layers?search=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new NzSourceApiError('LRIS', `HTTP ${response.status}`);
  }
  return parseLrisLayers(await response.json());
}

/** LRIS adapter: Landcare Research layer search, keyless. */
export const lrisAdapter: NzDataAdapter<LrisLayer[]> = {
  id: 'lris',
  name: 'LRIS (Landcare Research) catalogue',
  auth: 'none',
  description: 'Searches Landcare Research layers (soil, land cover, ecosystems).',
  fetchLive: (options) => searchLrisLayers('soil', options?.fetchImpl),
  parse: parseLrisLayers,
  loadFixture: () => parseLrisLayers(readFixtureJson('lris-layer-search-soil-2026-08-25.json')),
};
