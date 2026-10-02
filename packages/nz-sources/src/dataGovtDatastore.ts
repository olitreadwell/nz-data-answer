import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One row from a data.govt.nz CKAN datastore resource. */
export type DataGovtDatastoreRow = Record<string, string | number | boolean | null>;

/** Rows from a data.govt.nz CKAN datastore resource. */
export interface DataGovtDatastoreResult {
  resourceId: string;
  total: number;
  records: DataGovtDatastoreRow[];
}

/** The default resource the adapter probes: MSD national-level main benefit data. */
export const MSD_BENEFIT_RESOURCE_ID = '9144a616-9ab1-4475-972b-ac42c1f891b7';

const DATA_GOVT_NZ_ROW_SCHEMA = z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]));

const DATA_GOVT_NZ_DATASTORE_SCHEMA = z.object({
  success: z.literal(true),
  result: z.object({
    resource_id: z.string(),
    total: z.number(),
    records: z.array(DATA_GOVT_NZ_ROW_SCHEMA),
  }),
});

/** Parses a data.govt.nz CKAN datastore_search payload into rows. */
export function parseDataGovtDatastoreRows(payload: unknown): DataGovtDatastoreResult {
  const parsed = DATA_GOVT_NZ_DATASTORE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('data.govt.nz datastore', parsed.error.message);
  }
  return {
    resourceId: parsed.data.result.resource_id,
    total: parsed.data.result.total,
    records: parsed.data.result.records,
  };
}

/**
 * Fetches rows from a data.govt.nz CKAN datastore resource. Keyless.
 * Falls back to a committed fixture when the API is unreachable.
 */
export async function fetchDataGovtDatastoreRows(
  resourceId: string,
  options: { limit?: number; fetchImpl?: typeof globalThis.fetch } = {}
): Promise<DataGovtDatastoreResult> {
  const limit = options.limit ?? 1000;
  const url =
    `https://catalogue.data.govt.nz/api/3/action/datastore_search` +
    `?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}`;
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('data.govt.nz datastore', `HTTP ${response.status}`);
  }
  return parseDataGovtDatastoreRows(await response.json());
}

/**
 * data.govt.nz datastore adapter: CKAN datastore_search over the national
 * open data catalogue. Keyless. The live probe reads the MSD national
 * benefit table, a long monthly series.
 */
export const dataGovtDatastoreAdapter: NzDataAdapter<DataGovtDatastoreResult> = {
  id: 'data-govt-datastore',
  name: 'data.govt.nz datastore (MSD benefits)',
  auth: 'none',
  description: 'CKAN datastore_search rows, defaulting to national MSD benefit data.',
  fetchLive: (options) =>
    fetchDataGovtDatastoreRows(
      MSD_BENEFIT_RESOURCE_ID,
      options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }
    ),
  parse: parseDataGovtDatastoreRows,
  loadFixture: () =>
    parseDataGovtDatastoreRows(readFixtureJson('data-govt-datastore-msd-benefits.json')),
};
