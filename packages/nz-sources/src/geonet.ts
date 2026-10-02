import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One earthquake reported by GeoNet (GNS Science). */
export interface GeoNetQuake {
  publicId: string;
  time: string;
  depthKm: number;
  magnitude: number;
  mmi: number;
  locality: string;
  quality: string;
  latitude: number;
  longitude: number;
}

/** Rolled-up facts about a set of quakes. */
export interface GeoNetQuakeSummary {
  total: number;
  strongest: GeoNetQuake | undefined;
  shallowest: GeoNetQuake | undefined;
  byMagnitudeBand: Record<string, number>;
}

const GEO_NET_QUAKE_SCHEMA = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.literal('Point'),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    publicID: z.string(),
    time: z.string(),
    depth: z.number(),
    magnitude: z.number(),
    mmi: z.number(),
    locality: z.string(),
    quality: z.string(),
  }),
});

const GEO_NET_RESPONSE_SCHEMA = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GEO_NET_QUAKE_SCHEMA),
});

/** Parses a GeoNet /quake GeoJSON payload into quake records. */
export function parseGeoNetQuakes(payload: unknown): GeoNetQuake[] {
  const parsed = GEO_NET_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('GeoNet', parsed.error.message);
  }
  return parsed.data.features.map((feature) => ({
    publicId: feature.properties.publicID,
    time: feature.properties.time,
    depthKm: feature.properties.depth,
    magnitude: feature.properties.magnitude,
    mmi: feature.properties.mmi,
    locality: feature.properties.locality,
    quality: feature.properties.quality,
    latitude: feature.geometry.coordinates[1],
    longitude: feature.geometry.coordinates[0],
  }));
}

/** Summarizes quakes: count, strongest, shallowest, and magnitude bands. */
export function summarizeGeoNetQuakes(quakes: GeoNetQuake[]): GeoNetQuakeSummary {
  const majorMagnitude = 5;
  const moderateMagnitude = 4;
  const byMagnitudeBand: Record<string, number> = {};
  for (const quake of quakes) {
    const band =
      quake.magnitude >= majorMagnitude
        ? '5+'
        : quake.magnitude >= moderateMagnitude
          ? '4-5'
          : '3-4';
    byMagnitudeBand[band] = (byMagnitudeBand[band] ?? 0) + 1;
  }
  const strongest = quakes.reduce<GeoNetQuake | undefined>(
    (best, quake) => (best === undefined || quake.magnitude > best.magnitude ? quake : best),
    undefined
  );
  const shallowest = quakes.reduce<GeoNetQuake | undefined>(
    (best, quake) => (best === undefined || quake.depthKm < best.depthKm ? quake : best),
    undefined
  );
  return { total: quakes.length, strongest, shallowest, byMagnitudeBand };
}

/**
 * Fetches recent felt quakes (MMI >= minMmi) from the public GeoNet API.
 * Keyless; falls back to a committed fixture when the API is unreachable.
 */
export async function fetchGeoNetFeltQuakes(
  minMmi = 3,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<GeoNetQuake[]> {
  const response = await fetchImpl(`https://api.geonet.org.nz/quake?MMI=${minMmi}`);
  if (!response.ok) {
    throw new NzSourceApiError('GeoNet', `HTTP ${response.status}`);
  }
  return parseGeoNetQuakes(await response.json());
}

/** GeoNet adapter: recent felt quakes, keyless. */
export const geonetAdapter: NzDataAdapter<GeoNetQuake[]> = {
  id: 'geonet',
  name: 'GeoNet (GNS Science)',
  auth: 'none',
  description: 'Recent felt earthquakes (MMI >= 3) as GeoJSON.',
  fetchLive: (options) => fetchGeoNetFeltQuakes(3, options?.fetchImpl),
  parse: parseGeoNetQuakes,
  loadFixture: () => parseGeoNetQuakes(readFixtureJson('geonet-quakes-mmi3.json')),
};
