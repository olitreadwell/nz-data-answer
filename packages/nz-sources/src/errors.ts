/** Base error for any NZ data source client in this package. */
export class NzSourceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NzSourceError';
  }
}

/** The remote API rejected the request (HTTP error or bad payload). */
export class NzSourceApiError extends NzSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'NzSourceApiError';
  }
}

/** The remote payload did not match the expected shape. */
export class NzSourceParseError extends NzSourceError {
  constructor(
    public readonly source: string,
    message: string,
    options?: ErrorOptions
  ) {
    super(`${source}: ${message}`, options);
    this.name = 'NzSourceParseError';
  }
}
