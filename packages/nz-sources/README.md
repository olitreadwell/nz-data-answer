# @nz-open-data-connectors/nz-sources

Uniform TypeScript adapters for NZ public data sources. Every adapter has the same shape: a live fetch, a strict parse, and a committed fixture fallback so builds work offline.

## Adapters

| id            | Source                          | Auth   | What it does                          |
| ------------- | ------------------------------- | ------ | ------------------------------------- |
| `geonet`      | GeoNet                          | none   | Felt earthquake reports               |
| `data-govt-nz`| data.govt.nz search             | none   | Dataset search                        |
| `datastore`   | data.govt.nz datastore          | none   | Row pulls (e.g. MSD benefits)         |
| `ade-search`  | Aotearoa Data Explorer search   | none   | Dataflow search                       |
| `digitalnz`   | DigitalNZ                       | key    | Record search (key optional)          |
| `trademe`     | Trade Me                        | none   | Category tree                         |
| `nzor`        | NZ Organisms Register           | none   | Species name search                   |
| `linz`        | LINZ Data Service               | key    | Layer search (key optional)           |

## Quick start

```ts
import { NZ_DATA_SOURCES, probeAllNzDataSources } from '@nz-open-data-connectors/nz-sources';

// List every source.
for (const source of NZ_DATA_SOURCES) {
  console.log(source.id, source.name, source.auth);
}

// Live probe every source, with optional keys.
const probes = await probeAllNzDataSources({
  apiKeys: {
    linz: process.env.LINZ_API_KEY,
    digitalnz: process.env.DIGITAL_NZ_API_KEY,
  },
});
```

## Keys

All adapters work keyless. `linz` and `digitalnz` accept an optional key for higher rate limits and richer results. Keys are read from env only; never commit them.

## Tests

```sh
npm run test -w @nz-open-data-connectors/nz-sources        # unit tests, fixtures only, no network
RUN_SMOKE=1 npm run test:smoke -w @nz-open-data-connectors/nz-sources   # live probes against the real APIs
```

Fixtures in `src/fixtures/` are real snapshots from the live APIs. Smoke tests are skipped by default and must be run explicitly.
