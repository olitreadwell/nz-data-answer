import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One category in the Trade Me category tree. */
export interface TradeMeCategory {
  name: string;
  number: string;
  path: string;
  isLeaf: boolean;
  subcategories: TradeMeCategory[];
}

/** Raw Trade Me category shape before mapping to TradeMeCategory. */
interface RawTradeMeCategory {
  Name: string;
  Number: string;
  Path: string;
  IsLeaf: boolean;
  Subcategories: RawTradeMeCategory[];
}

function isRawTradeMeCategory(value: unknown): value is RawTradeMeCategory {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.Name === 'string' &&
    typeof record.Number === 'string' &&
    typeof record.Path === 'string' &&
    (record.IsLeaf === undefined || typeof record.IsLeaf === 'boolean') &&
    (record.Subcategories === undefined || Array.isArray(record.Subcategories))
  );
}

/** Parses a Trade Me Categories.json payload into a category tree. */
export function parseTradeMeCategories(payload: unknown): TradeMeCategory {
  if (!isRawTradeMeCategory(payload)) {
    throw new NzSourceParseError('Trade Me', 'invalid category payload');
  }
  return toTradeMeCategory(payload);
}

function toTradeMeCategory(category: RawTradeMeCategory): TradeMeCategory {
  return {
    name: category.Name,
    number: category.Number,
    path: category.Path,
    isLeaf: category.IsLeaf,
    subcategories: (category.Subcategories ?? []).map(toTradeMeCategory),
  };
}

/** Fetches the Trade Me category tree. Public endpoint, keyless. */
export async function fetchTradeMeCategories(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<TradeMeCategory> {
  const response = await fetchImpl('https://api.trademe.co.nz/v1/Categories.json');
  if (!response.ok) {
    throw new NzSourceApiError('Trade Me', `HTTP ${response.status}`);
  }
  return parseTradeMeCategories(await response.json());
}

/** Trade Me adapter: category tree, keyless for public endpoints. */
export const tradeMeAdapter: NzDataAdapter<TradeMeCategory> = {
  id: 'trademe',
  name: 'Trade Me categories',
  auth: 'none',
  description: 'The public Trade Me category tree.',
  fetchLive: (options) => fetchTradeMeCategories(options?.fetchImpl),
  parse: parseTradeMeCategories,
  loadFixture: () => parseTradeMeCategories(readFixtureJson('trademe-categories.json')),
};
