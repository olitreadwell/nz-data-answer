import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** Default ArcGIS Hub host: Auckland Council open data. */
export const DEFAULT_ARCGIS_HUB_HOST = 'https://data-aucklandcouncil.opendata.arcgis.com';

/** One collection advertised by an ArcGIS Hub search API. */
export interface ArcgisHubCollection {
  id: string;
  title: string;
  itemType: string;
  description: string;
}

/** One dataset found by an ArcGIS Hub dataset search. */
export interface ArcgisHubDataset {
  id: string;
  title: string;
  snippet: string;
  type: string;
  url: string;
  owner: string;
  source: string;
  tags: string[];
  modified: number;
  created: number;
  numViews: number;
  access: string;
}

/** Options for ArcGIS Hub live fetches: host and optional search query. */
export interface ArcgisHubFetchOptions {
  host?: string;
  q?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/** Result of an ArcGIS Hub live fetch: collections or dataset search. */
export type ArcgisHubResult =
  | { kind: 'collections'; collections: ArcgisHubCollection[] }
  | { kind: 'datasets'; datasets: ArcgisHubDataset[] };

const ARCGIS_HUB_COLLECTION_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  itemType: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

const ARCGIS_HUB_COLLECTIONS_RESPONSE_SCHEMA = z.object({
  collections: z.array(ARCGIS_HUB_COLLECTION_SCHEMA),
});

const ARCGIS_HUB_DATASET_SCHEMA = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  type: z.string(),
  url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  owner: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  source: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  tags: z.array(z.string()).optional().default([]),
  modified: z.number().optional().default(0),
  created: z.number().optional().default(0),
  numViews: z.number().optional().default(0),
  access: z.string().optional().default(''),
});

const ARCGIS_HUB_DATASETS_RESPONSE_SCHEMA = z.object({
  type: z.string(),
  features: z.array(
    z.object({
      id: z.string(),
      properties: ARCGIS_HUB_DATASET_SCHEMA,
    })
  ),
  numberMatched: z.number().optional().default(0),
  numberReturned: z.number().optional().default(0),
});

/**
 * Normalizes a host option to a base URL with scheme and no trailing slash.
 *
 * @param host - Host or base URL, with or without scheme.
 * @returns The normalized base URL.
 */
export function normalizeArcgisHubHost(host: string): string {
  const trimmed = stripTrailingSlashes(host.trim());
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * Removes trailing slashes without a regex, so host input stays linear.
 *
 * @param value - A host string that may end in slashes.
 * @returns The host without trailing slashes.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Parses an ArcGIS Hub collections payload into collections.
 *
 * @param payload - Raw JSON from the collections endpoint.
 * @returns The advertised collections.
 */
export function parseArcgisHubCollections(payload: unknown): ArcgisHubCollection[] {
  const parsed = ARCGIS_HUB_COLLECTIONS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('ArcGIS Hub', parsed.error.message);
  }
  return parsed.data.collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    itemType: collection.itemType,
    description: collection.description,
  }));
}

/**
 * Parses an ArcGIS Hub dataset search payload into datasets.
 *
 * @param payload - Raw GeoJSON from the dataset items endpoint.
 * @returns The datasets found by the search.
 */
export function parseArcgisHubDatasets(payload: unknown): ArcgisHubDataset[] {
  const parsed = ARCGIS_HUB_DATASETS_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('ArcGIS Hub', parsed.error.message);
  }
  return parsed.data.features.map((feature) => ({
    id: feature.id,
    title: feature.properties.title,
    snippet: feature.properties.snippet,
    type: feature.properties.type,
    url: feature.properties.url,
    owner: feature.properties.owner,
    source: feature.properties.source,
    tags: feature.properties.tags,
    modified: feature.properties.modified,
    created: feature.properties.created,
    numViews: feature.properties.numViews,
    access: feature.properties.access,
  }));
}

/**
 * Parses an ArcGIS Hub payload into collections or datasets by shape.
 *
 * @param payload - Raw JSON from either ArcGIS Hub endpoint.
 * @returns Collections when the payload has a collections list, else datasets.
 */
export function parseArcgisHubResult(payload: unknown): ArcgisHubResult {
  if (typeof payload === 'object' && payload !== null && 'collections' in payload) {
    return {
      kind: 'collections',
      collections: parseArcgisHubCollections(payload),
    };
  }
  return { kind: 'datasets', datasets: parseArcgisHubDatasets(payload) };
}

/**
 * Fetches the collection list from an ArcGIS Hub search API. Keyless.
 * Falls back to a committed fixture when the API is unreachable.
 *
 * @param options - Host and fetch override.
 * @returns The advertised collections.
 */
export async function fetchArcgisHubCollections(
  options: ArcgisHubFetchOptions = {}
): Promise<ArcgisHubCollection[]> {
  const host = normalizeArcgisHubHost(options.host ?? DEFAULT_ARCGIS_HUB_HOST);
  const url = `${host}/api/search/v1/collections`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('ArcGIS Hub', `HTTP ${response.status}`);
  }
  return parseArcgisHubCollections(await response.json());
}

/**
 * Searches datasets on an ArcGIS Hub search API by keyword. Keyless.
 * Falls back to a committed fixture when the API is unreachable.
 *
 * @param query - Search keyword, e.g. "parks".
 * @param options - Host and fetch override.
 * @returns The datasets found by the search.
 */
export async function searchArcgisHubDatasets(
  query: string,
  options: ArcgisHubFetchOptions = {}
): Promise<ArcgisHubDataset[]> {
  const host = normalizeArcgisHubHost(options.host ?? DEFAULT_ARCGIS_HUB_HOST);
  const url = new URL(`${host}/api/search/v1/collections/dataset/items`);
  url.searchParams.set('q', query);
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('ArcGIS Hub', `HTTP ${response.status}`);
  }
  return parseArcgisHubDatasets(await response.json());
}

/**
 * ArcGIS Hub adapter: keyless open data search, host-configurable. The live
 * probe hits the collections endpoint; passing a query searches datasets.
 */
export const arcgisHubAdapter = {
  id: 'arcgis',
  name: 'ArcGIS Hub open data',
  auth: 'none',
  description:
    'Searches NZ open data published on ArcGIS Hub (Auckland Council, WCC, Canterbury, NZTA).',
  fetchLive: (options?: ArcgisHubFetchOptions) => {
    const host = options?.host;
    const query = options?.q;
    const fetchImpl = options?.fetchImpl;
    if (query !== undefined) {
      return searchArcgisHubDatasets(query, {
        ...(host === undefined ? {} : { host }),
        ...(fetchImpl === undefined ? {} : { fetchImpl }),
      }).then((datasets) => ({ kind: 'datasets', datasets }));
    }
    return fetchArcgisHubCollections({
      ...(host === undefined ? {} : { host }),
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    }).then((collections) => ({ kind: 'collections', collections }));
  },
  parse: parseArcgisHubResult,
  loadFixture: () => ({
    kind: 'datasets',
    datasets: parseArcgisHubDatasets(
      readFixtureJson(
        'arcgis-hub-data-aucklandcouncil.opendata.arcgis.com-datasets-parks-2026-08-25.json'
      )
    ),
  }),
} satisfies NzDataAdapter<ArcgisHubResult>;
