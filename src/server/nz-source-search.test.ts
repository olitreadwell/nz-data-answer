import { describe, expect, it, vi } from 'vitest';
import {
  MAX_NZ_SOURCE_SUMMARY_LENGTH,
  NZ_SOURCE_USER_AGENT,
  buildNzSourceQuery,
  searchNzSources,
  summariseSourceNotes,
  withNzSourceUserAgent,
} from '@/server/nz-source-search';

const CATALOGUE_PAYLOAD = {
  success: true,
  result: {
    count: 1,
    results: [
      {
        name: 'sheep-numbers',
        title: 'Sheep numbers by region',
        notes: '<p>National and regional flock counts.</p>',
        metadata_modified: '2026-01-01T00:00:00Z',
        url: '',
        organization: { title: 'Stats NZ' },
      },
    ],
  },
};

const ADE_PAYLOAD = {
  numFound: 1,
  dataflows: [
    {
      dataflowId: 'AGR_AGR_003',
      version: '1',
      agencyId: 'STATSNZ',
      name: 'Livestock Numbers by Regional Council',
      dimensions: ['Year', 'Region'],
    },
  ],
};

/** Route a fake fetch by host, so each test controls which source answers. */
function routedFetch(handlers: {
  catalogue?: () => Promise<Response>;
  explorer?: () => Promise<Response>;
}): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('catalogue.data.govt.nz')) {
      if (!handlers.catalogue) throw new Error('catalogue unreachable');
      return handlers.catalogue();
    }
    if (url.includes('explore.data.stats.govt.nz')) {
      if (!handlers.explorer) throw new Error('explorer unreachable');
      return handlers.explorer();
    }
    throw new Error(`unexpected url ${url}`);
  }) as typeof globalThis.fetch;
}

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe('summariseSourceNotes', () => {
  it('strips markup and collapses whitespace', () => {
    expect(summariseSourceNotes('<p>Flock   counts</p>\n\n<p>by region</p>')).toBe(
      'Flock counts by region'
    );
  });

  it('truncates on a word boundary', () => {
    const summary = summariseSourceNotes('word '.repeat(200));
    expect(summary.length).toBeLessThanOrEqual(MAX_NZ_SOURCE_SUMMARY_LENGTH + 3);
    expect(summary.endsWith('...')).toBe(true);
  });
});

describe('buildNzSourceQuery', () => {
  it('drops stopwords and punctuation', () => {
    expect(buildNzSourceQuery('How many sheep does New Zealand have?')).toBe('sheep new zealand');
  });

  it('drops catalogue-wide words when asked, for the CKAN search', () => {
    expect(buildNzSourceQuery('How many sheep does New Zealand have?', true)).toBe('sheep');
  });

  it('caps the number of terms', () => {
    const query = buildNzSourceQuery('earthquake magnitude region depth year population housing');
    expect(query.split(' ')).toHaveLength(6);
  });

  it('falls back to the question when every term is a stopword', () => {
    expect(buildNzSourceQuery('who is it')).toBe('who is it');
  });
});

describe('withNzSourceUserAgent', () => {
  it('adds the app user agent to every connector request', async () => {
    const seen: Array<Record<string, string>> = [];
    const spyFetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(init?.headers as Record<string, string>);
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }) as unknown as typeof globalThis.fetch;

    await withNzSourceUserAgent(spyFetch)('https://example.test');

    expect(seen[0]?.['user-agent']).toBe(NZ_SOURCE_USER_AGENT);
  });
});

describe('searchNzSources', () => {
  it('merges both sources into citable excerpts', async () => {
    const outcome = await searchNzSources(
      'sheep',
      routedFetch({
        catalogue: async () => jsonResponse(CATALOGUE_PAYLOAD),
        explorer: async () => jsonResponse(ADE_PAYLOAD),
      })
    );

    expect(outcome.failures).toEqual([]);
    expect(outcome.excerpts).toHaveLength(2);
    expect(outcome.excerpts[0]).toMatchObject({
      sourceId: 'data-govt-nz',
      title: 'Sheep numbers by region',
      url: 'https://catalogue.data.govt.nz/dataset/sheep-numbers',
      summary: 'National and regional flock counts.',
    });
    expect(outcome.excerpts[1]?.sourceId).toBe('ade-search');
    expect(outcome.excerpts[1]?.summary).toContain('Dimensions: Year, Region');
  });

  it('queries the catalogue with the narrowed terms', async () => {
    const seen: string[] = [];
    const spyFetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return {
        ok: true,
        status: 200,
        json: async () => (String(input).includes('catalogue') ? CATALOGUE_PAYLOAD : ADE_PAYLOAD),
      };
    }) as unknown as typeof globalThis.fetch;

    await searchNzSources('How many sheep does New Zealand have?', spyFetch);

    const catalogueUrl = seen.find((url) => url.includes('catalogue.data.govt.nz'));
    expect(catalogueUrl).toContain('q=sheep');
    expect(catalogueUrl).not.toContain('zealand');
  });

  it('keeps the working source when the other fails', async () => {
    const outcome = await searchNzSources(
      'sheep',
      routedFetch({ explorer: async () => jsonResponse(ADE_PAYLOAD) })
    );

    expect(outcome.excerpts).toHaveLength(1);
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]?.sourceId).toBe('data-govt-nz');
  });

  it('caps how many excerpts reach a prompt', async () => {
    const many = {
      success: true,
      result: {
        count: 20,
        results: Array.from({ length: 20 }, (_, index) => ({
          name: `dataset-${index}`,
          title: `Dataset ${index}`,
          notes: 'notes',
          metadata_modified: '2026-01-01T00:00:00Z',
          url: 'https://example.test/dataset',
          organization: { title: 'Stats NZ' },
        })),
      },
    };
    const outcome = await searchNzSources(
      'sheep',
      routedFetch({ catalogue: async () => jsonResponse(many) })
    );
    expect(outcome.excerpts.length).toBeLessThanOrEqual(8);
  });

  it('reports both sources when neither answers', async () => {
    const outcome = await searchNzSources('sheep', routedFetch({}));
    expect(outcome.excerpts).toEqual([]);
    expect(outcome.failures.map((failure) => failure.sourceId).sort()).toEqual([
      'ade-search',
      'data-govt-nz',
    ]);
  });
});

describe('searchNzSources logging', () => {
  it('does not throw when a source returns an unparseable payload', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outcome = await searchNzSources(
      'sheep',
      routedFetch({ catalogue: async () => jsonResponse({ nope: true }) })
    );
    expect(outcome.failures.some((failure) => failure.sourceId === 'data-govt-nz')).toBe(true);
    spy.mockRestore();
  });
});
