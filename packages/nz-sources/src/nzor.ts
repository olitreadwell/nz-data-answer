import { XMLParser } from 'fast-xml-parser';

import { NzSourceApiError, NzSourceParseError } from './errors';
import { readFixtureText } from './fixtures';
import type { NzDataAdapter } from './types';

/** One name in the NZ Organisms Register. */
export interface NzorName {
  nameId: string;
  className: string;
  fullName: string;
}

/** Result of an NZOR name search. */
export interface NzorSearchResult {
  total: number;
  names: NzorName[];
}

const NZOR_XML_PARSER = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
});

/** Parses an NZOR /names XML payload into a search result. */
export function parseNzorNames(payload: string): NzorSearchResult {
  const parsed = NZOR_XML_PARSER.parse(payload) as {
    Response?: { Total?: string; Names?: unknown };
  };
  const rawTotal = parsed.Response?.Total;
  if (rawTotal === undefined) {
    throw new NzSourceParseError('NZOR', 'missing Response/Total in XML payload');
  }
  const total = Number(rawTotal);
  if (!Number.isFinite(total)) {
    throw new NzSourceParseError('NZOR', 'invalid Response/Total in XML payload');
  }
  const namesNode = parsed.Response?.Names;
  if (namesNode !== undefined && (namesNode === null || typeof namesNode !== 'object')) {
    throw new NzSourceParseError('NZOR', 'invalid Response/Names in XML payload');
  }
  const nameList = (namesNode as { Name?: unknown } | undefined)?.Name ?? [];
  const names = (Array.isArray(nameList) ? nameList : [nameList]).map((raw) => {
    const name = raw as { NameId?: string; Class?: string; FullName?: string };
    return {
      nameId: name.NameId ?? '',
      className: name.Class ?? '',
      fullName: name.FullName ?? '',
    };
  });
  return { total, names };
}

/** Searches the NZ Organisms Register. Keyless XML API. */
export async function searchNzorNames(
  query: string,
  fetchImpl: typeof globalThis.fetch = globalThis.fetch
): Promise<NzorSearchResult> {
  const url = `https://data.nzor.org.nz/names?q=${encodeURIComponent(query)}`;
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new NzSourceApiError('NZOR', `HTTP ${response.status}`);
  }
  return parseNzorNames(await response.text());
}

/** NZOR adapter: organism name search, keyless. */
export const nzorAdapter: NzDataAdapter<NzorSearchResult> = {
  id: 'nzor',
  name: 'NZ Organisms Register',
  auth: 'none',
  description: 'Search 170,000+ scientific and vernacular organism names.',
  fetchLive: (options) => searchNzorNames('kiwi', options?.fetchImpl),
  parse: (payload) => parseNzorNames(String(payload)),
  loadFixture: () => parseNzorNames(readFixtureText('nzor-names-kiwi.xml')),
};
