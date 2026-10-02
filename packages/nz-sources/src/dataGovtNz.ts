import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One dataset in the data.govt.nz catalogue. */
export interface DataGovtNzDataset {
  name: string;
  title: string;
  notes: string;
  metadataModified: string;
  url: string;
  organization: string | undefined;
}

/** A data.govt.nz CKAN package_search response: total count plus the rows. */
export interface DataGovtNzSearchResult {
  count: number;
  datasets: DataGovtNzDataset[];
}

const DATA_GOVT_NZ_DATASET_SCHEMA = z.object({
  name: z.string(),
  title: z.string(),
  notes: z.string().optional().default(''),
  metadata_modified: z.string(),
  url: z.string().optional().default(''),
  organization: z
    .object({ title: z.string() })
    .optional()
    .transform((org) => org?.title),
});

const DATA_GOVT_NZ_RESPONSE_SCHEMA = z.object({
  success: z.literal(true),
  result: z.object({
    count: z.number(),
    results: z.array(DATA_GOVT_NZ_DATASET_SCHEMA),
  }),
});

/** Parses a data.govt.nz CKAN package_search payload into datasets. */
export function parseDataGovtNzDatasets(payload: unknown): DataGovtNzSearchResult {
  const parsed = DATA_GOVT_NZ_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('data.govt.nz', parsed.error.message);
  }
  return {
    count: parsed.data.result.count,
    datasets: parsed.data.result.results.map((dataset) => ({
      name: dataset.name,
      title: dataset.title,
      notes: dataset.notes,
      metadataModified: dataset.metadata_modified,
      url: dataset.url,
      organization: dataset.organization,
    })),
  };
}

/**
 * Searches the public data.govt.nz catalogue (CKAN API). Keyless.
 * Falls back to a committed fixture when the API is unreachable.
 */
export async function searchDataGovtNzDatasets(
  query: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<DataGovtNzSearchResult> {
  const url = `https://catalogue.data.govt.nz/api/3/action/package_search?q=${encodeURIComponent(query)}&rows=20`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new NzSourceApiError('data.govt.nz', `HTTP ${response.status}`);
  }
  return parseDataGovtNzDatasets(await response.json());
}

/** data.govt.nz adapter: catalogue search, keyless. */
export const dataGovtNzAdapter: NzDataAdapter<DataGovtNzSearchResult> = {
  id: 'data-govt-nz',
  name: 'data.govt.nz catalogue',
  auth: 'none',
  description: 'CKAN package_search over the national open data catalogue.',
  fetchLive: (options) => searchDataGovtNzDatasets('sheep', options?.fetchImpl),
  parse: parseDataGovtNzDatasets,
  loadFixture: () => parseDataGovtNzDatasets(readFixtureJson('data-govt-nz-search-sheep.json')),
};
