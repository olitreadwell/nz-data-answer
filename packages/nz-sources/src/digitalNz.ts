import { z } from 'zod';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureJson } from './fixtures';
import type { NzDataAdapter } from './types';

/** One record from the DigitalNZ (National Library) search API. */
export interface DigitalNzRecord {
  id: number;
  title: string;
  description: string;
  contentPartner: string;
  collection: string;
  url: string;
  categories: string[];
  thumbnailUrl: string;
  largeThumbnailUrl: string;
  objectUrl: string;
  sourceUrl: string;
  displayDate: string;
}

const DIGITAL_NZ_RECORD_SCHEMA = z.object({
  id: z.number(),
  title: z.string(),
  description: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  display_content_partner: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  display_collection: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  landing_url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  category: z.array(z.string()).optional().default([]),
  thumbnail_url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  large_thumbnail_url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  object_url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  source_url: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
  display_date: z
    .string()
    .nullable()
    .optional()
    .transform((value) => value ?? ''),
});

const DIGITAL_NZ_RESPONSE_SCHEMA = z.object({
  search: z.object({
    result_count: z.number(),
    results: z.array(DIGITAL_NZ_RECORD_SCHEMA),
  }),
});

/** Parses a DigitalNZ v3 records payload into records. */
export function parseDigitalNzRecords(payload: unknown): DigitalNzRecord[] {
  const parsed = DIGITAL_NZ_RESPONSE_SCHEMA.safeParse(payload);
  if (!parsed.success) {
    throw new NzSourceParseError('DigitalNZ', parsed.error.message);
  }
  return parsed.data.search.results.map((record) => ({
    id: record.id,
    title: record.title,
    description: record.description,
    contentPartner: record.display_content_partner,
    collection: record.display_collection,
    url: record.landing_url,
    categories: record.category,
    thumbnailUrl: record.thumbnail_url,
    largeThumbnailUrl: record.large_thumbnail_url,
    objectUrl: record.object_url,
    sourceUrl: record.source_url,
    displayDate: record.display_date,
  }));
}

/**
 * Every supported media type, in CLI help and validation order. Artwork
 * shares the Images category because DigitalNZ has no separate artwork
 * category.
 */
export const DIGITAL_NZ_MEDIA_TYPES = [
  'images',
  'newspapers',
  'videos',
  'audio',
  'literature',
  'artwork',
] as const;

/** A media type for DigitalNZ searches. */
export type DigitalNzMediaType = (typeof DIGITAL_NZ_MEDIA_TYPES)[number];

/** Maps each media type to the DigitalNZ category filter value. */
export function getDigitalNzCategoryFilter(mediaType: DigitalNzMediaType): string {
  const CATEGORY_FILTERS: Record<DigitalNzMediaType, string> = {
    images: 'Images',
    newspapers: 'Newspapers',
    videos: 'Videos',
    audio: 'Audio',
    literature: 'Books',
    artwork: 'Images',
  };
  return CATEGORY_FILTERS[mediaType];
}

/** Options for a DigitalNZ search: optional API key and fetch override. */
export interface DigitalNzSearchOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * Searches the DigitalNZ (National Library) API. The v3 search endpoint
 * answers keyless; passing an API key raises the rate limit. Falls back to a
 * committed fixture when unreachable.
 */
export async function searchDigitalNzRecords(
  query: string,
  options: DigitalNzSearchOptions = {}
): Promise<DigitalNzRecord[]> {
  const url = new URL('https://api.digitalnz.org/v3/records.json');
  url.searchParams.set('text', query);
  url.searchParams.set('per_page', '20');
  if (options.apiKey !== undefined) {
    url.searchParams.set('api_key', options.apiKey);
  }
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('DigitalNZ', `HTTP ${response.status}`);
  }
  return parseDigitalNzRecords(await response.json());
}

/** Options for a DigitalNZ media search: optional API key and fetch override. */
export interface DigitalNzMediaSearchOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * Searches DigitalNZ for one media type (images, newspapers, videos, audio,
 * literature, or artwork). Records include preview image URLs where the
 * source supplies them. Keyless by default; an API key raises the rate limit.
 */
export async function searchDigitalNzMedia(
  query: string,
  mediaType: DigitalNzMediaType,
  options: DigitalNzMediaSearchOptions = {}
): Promise<DigitalNzRecord[]> {
  const url = new URL('https://api.digitalnz.org/v3/records.json');
  url.searchParams.set('text', query);
  url.searchParams.set('per_page', '20');
  url.searchParams.set('and[category][]', getDigitalNzCategoryFilter(mediaType));
  if (options.apiKey !== undefined) {
    url.searchParams.set('api_key', options.apiKey);
  }
  const response = await (options.fetchImpl ?? globalThis.fetch)(url);
  if (!response.ok) {
    throw new NzSourceApiError('DigitalNZ', `HTTP ${response.status}`);
  }
  return parseDigitalNzRecords(await response.json());
}

/** DigitalNZ adapter: catalogue search, keyless with optional key. */
export const digitalNzAdapter: NzDataAdapter<DigitalNzRecord[]> = {
  id: 'digitalnz',
  name: 'DigitalNZ (National Library)',
  auth: 'none',
  description: 'Search over 1.7 million digitised NZ records.',
  fetchLive: (options) =>
    searchDigitalNzRecords('sheep', {
      ...(options?.apiKey === undefined ? {} : { apiKey: options.apiKey }),
      ...(options?.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    }),
  parse: parseDigitalNzRecords,
  loadFixture: () => parseDigitalNzRecords(readFixtureJson('digitalnz-search-sheep.json')),
};
