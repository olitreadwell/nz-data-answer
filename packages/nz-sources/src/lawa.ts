import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One river quality monitoring site reported by LAWA. */
export interface LawaRiverQualitySite {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  url: string;
  code: string;
  isActive: boolean;
  hasScientificData: boolean;
  hasEcologyData: boolean;
}

const LAWA_SITE_SCHEMA = z.object({
  Id: z.number(),
  Name: z.string(),
  Latitude: z.number(),
  Longitude: z.number(),
  Url: z.string(),
  Code: z.string(),
  IsActive: z.boolean(),
  HasScientificData: z.boolean(),
  HasEcologyData: z.boolean(),
  IsBackground: z.boolean().optional().default(false),
});

const LAWA_RESPONSE_SCHEMA = z.array(LAWA_SITE_SCHEMA);

/**
 * Parses a LAWA river quality sites payload into site records. Region
 * boundary rows (IsBackground) are dropped so only monitoring sites remain.
 *
 * @param payload - Raw LAWA river quality sites JSON.
 * @returns Monitoring site records, excluding region boundary rows.
 */
export function parseLawaRiverQualitySites(payload: unknown): LawaRiverQualitySite[] {
  const parsed = LAWA_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('LAWA', parsed.error.message);
  }
  return parsed.data
    .filter((site) => !site.IsBackground)
    .map((site) => ({
      id: site.Id,
      name: site.Name.trim(),
      latitude: site.Latitude,
      longitude: site.Longitude,
      url: site.Url,
      code: site.Code,
      isActive: site.IsActive,
      hasScientificData: site.HasScientificData,
      hasEcologyData: site.HasEcologyData,
    }));
}

/**
 * Fetches river quality monitoring sites from the LAWA map service.
 * Keyless; falls back to a committed fixture when the API is unreachable.
 *
 * @param fetchImpl - Fetch implementation override for tests.
 * @returns Monitoring site records, excluding region boundary rows.
 */
export async function fetchLawaRiverQualitySites(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<LawaRiverQualitySite[]> {
  const response = await fetchImpl(
    'https://www.lawa.org.nz/umbraco/api/mapservice/RiverQualitySites'
  );
  if (!response.ok) {
    throw new NzSourceApiError('LAWA', `HTTP ${response.status}`);
  }
  return parseLawaRiverQualitySites(await response.json());
}

/** LAWA adapter: river quality monitoring sites, keyless. */
export const lawaAdapter: NzDataAdapter<LawaRiverQualitySite[]> = {
  id: 'lawa',
  name: 'LAWA river quality sites',
  auth: 'none',
  description: 'River quality monitoring sites from Land, Air, Water Aotearoa (LAWA).',
  fetchLive: (options) => fetchLawaRiverQualitySites(options?.fetchImpl),
  parse: parseLawaRiverQualitySites,
  loadFixture: () =>
    parseLawaRiverQualitySites(readFixtureJson('lawa-river-quality-sites-2026-08-25.json')),
};
