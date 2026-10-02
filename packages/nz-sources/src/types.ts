/** What a source needs before it will answer a request. */
export type NzSourceAuth = 'none' | 'key' | 'account';

/** Options shared by every adapter's live fetch. */
export interface NzFetchOptions {
  apiKey?: string;
  fetchImpl?: typeof globalThis.fetch;
}

/**
 * One NZ data source behind a uniform interface: live fetch, strict parse,
 * and a committed fixture fallback so builds work offline.
 */
export interface NzDataAdapter<T> {
  readonly id: string;
  readonly name: string;
  readonly auth: NzSourceAuth;
  readonly description: string;
  fetchLive(options?: NzFetchOptions): Promise<T>;
  parse(payload: unknown): T;
  loadFixture(): T;
}

/** Result of a live verification probe against one source. */
export interface NzSourceProbe {
  id: string;
  name: string;
  auth: NzSourceAuth;
  ok: boolean;
  status: string;
  sample?: string;
}
