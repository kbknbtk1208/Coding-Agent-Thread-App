export class ProviderApiError extends Error {
  readonly status: number | null;
  readonly url: string;
  readonly responseBodyExcerpt: string | null;
  readonly cause?: unknown;

  constructor(input: {
    message: string;
    status: number | null;
    url: string;
    responseBodyExcerpt?: string | null;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = 'ProviderApiError';
    this.status = input.status;
    this.url = input.url;
    this.responseBodyExcerpt = input.responseBodyExcerpt ?? null;
    this.cause = input.cause;
  }
}

export function isProviderApiError(err: unknown): err is ProviderApiError {
  return err instanceof ProviderApiError;
}
