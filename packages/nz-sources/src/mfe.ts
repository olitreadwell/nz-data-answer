import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One layer in the MfE Data Service catalogue. */
export interface MfeLayer {
  id: number;
  title: string;
  url: string;
  publicAccess: string;
}

const MFE_LAYER_SCHEMA = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  public_access: z.string().optional().default(''),
});

const MFE_SEARCH_RESPONSE_SCHEMA = z.array(MFE_LAYER_SCHEMA);

/**
 * Parses an MfE Data Service layer search payload into layers.
 *
 * @param payload - Raw MfE Data Service layer search JSON.
 * @returns Layer records with id, title, url, and public access.
 */
export function parseMfeLayers(payload: unknown): MfeLayer[] {
  const parsed = MFE_SEARCH_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('MfE', parsed.error.message);
  }
  return parsed.data.map((layer) => ({
    id: layer.id,
    title: layer.title,
    url: layer.url,
    publicAccess: layer.public_access,
  }));
}

/**
 * Searches the MfE Data Service catalogue for layers (e.g. "water").
 * Keyless; falls back to a committed fixture when the API is unreachable.
 *
 * @param query - Layer search text, e.g. "water".
 * @param fetchImpl - Fetch implementation override for tests.
 * @returns Layer records matching the query.
 */
export async function searchMfeLayers(
  query: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<MfeLayer[]> {
  const url = `https://data.mfe.govt.nz/services/api/v1/layers?search=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new NzSourceApiError('MfE', `HTTP ${response.status}`);
  }
  return parseMfeLayers(await response.json());
}

/** MfE adapter: Ministry for the Environment layer search, keyless. */
export const mfeAdapter: NzDataAdapter<MfeLayer[]> = {
  id: 'mfe',
  name: 'MfE Data Service catalogue',
  auth: 'none',
  description: 'Searches Ministry for the Environment layers (water, land, climate).',
  fetchLive: (options) => searchMfeLayers('water', options?.fetchImpl),
  parse: parseMfeLayers,
  loadFixture: () => parseMfeLayers(readFixtureJson('mfe-layer-search-water-2026-08-25.json')),
};
