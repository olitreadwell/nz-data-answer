import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One holiday journey hotspot reported by Waka Kotahi (NZTA). */
export interface NztaHolidayHotspot {
  holidayName: string;
  regionTitle: string;
  title: string;
  latitude: number;
  longitude: number;
}

const NZTA_HOTSPOT_SCHEMA = z.object({
  type: z.literal('Feature'),
  properties: z.object({
    holidayName: z.string(),
    RegionTitle: z.string(),
    Title: z.string(),
  }),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
});

const NZTA_HOLIDAY_SCHEMA = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(NZTA_HOTSPOT_SCHEMA),
});

const NZTA_RESPONSE_SCHEMA = z.record(z.string(), NZTA_HOLIDAY_SCHEMA);

/**
 * Parses a Waka Kotahi holiday hotspots payload into hotspot records.
 * Geometry coordinates are [longitude, latitude] GeoJSON order.
 *
 * @param payload - Raw Waka Kotahi holiday hotspots JSON.
 * @returns Holiday hotspot records with holiday, region, and coordinates.
 */
export function parseNztaHolidayHotspots(payload: unknown): NztaHolidayHotspot[] {
  const parsed = NZTA_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('Waka Kotahi', parsed.error.message);
  }
  const hotspots: NztaHolidayHotspot[] = [];
  for (const holiday of Object.values(parsed.data)) {
    for (const feature of holiday.features) {
      hotspots.push({
        holidayName: feature.properties.holidayName,
        regionTitle: feature.properties.RegionTitle,
        title: feature.properties.Title,
        latitude: feature.geometry.coordinates[1],
        longitude: feature.geometry.coordinates[0],
      });
    }
  }
  return hotspots;
}

/**
 * Fetches holiday journey hotspots from the Waka Kotahi journeys API.
 * Keyless; needs an Accept: application/json header. Falls back to a
 * committed fixture when the API is unreachable.
 *
 * @param fetchImpl - Fetch implementation override for tests.
 * @returns Holiday hotspot records with holiday, region, and coordinates.
 */
export async function fetchNztaHolidayHotspots(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<NztaHolidayHotspot[]> {
  const response = await fetchImpl('https://www.journeys.nzta.govt.nz/api/hotspots', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new NzSourceApiError('Waka Kotahi', `HTTP ${response.status}`);
  }
  return parseNztaHolidayHotspots(await response.json());
}

/** Waka Kotahi adapter: holiday journey hotspots, keyless. */
export const nztaAdapter: NzDataAdapter<NztaHolidayHotspot[]> = {
  id: 'nzta',
  name: 'Waka Kotahi holiday hotspots',
  auth: 'none',
  description: 'Predicted busy holiday journey hotspots from the NZTA journeys API.',
  fetchLive: (options) => fetchNztaHolidayHotspots(options?.fetchImpl),
  parse: parseNztaHolidayHotspots,
  loadFixture: () =>
    parseNztaHolidayHotspots(readFixtureJson('nzta-holiday-hotspots-2026-08-25.json')),
};
