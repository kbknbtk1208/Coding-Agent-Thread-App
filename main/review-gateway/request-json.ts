import { ReviewGatewayError, isReviewGatewayError } from './review-gateway-error';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface RequestJsonOptions {
  fetchImpl?: FetchLike;
  headers?: HeadersInit;
  method?: string;
  body?: BodyInit | null;
  timeoutMs?: number;
}

export interface RequestPagedJsonOptions extends RequestJsonOptions {
  pageParam?: string;
  perPageParam?: string;
  pageSize?: number;
  maxPages?: number;
}

function toFetchImpl(fetchImpl?: FetchLike): FetchLike {
  if (fetchImpl) {
    return fetchImpl;
  }

  const globalFetch = globalThis.fetch;
  if (!globalFetch) {
    throw new ReviewGatewayError('REQUEST_FAILED', 'Global fetch is not available.');
  }
  return globalFetch.bind(globalThis);
}

function buildHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function formatStatusMessage(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) {
    return `HTTP ${status}`;
  }
  return `HTTP ${status}: ${trimmed}`;
}

async function ensureOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const body = await readResponseBody(response);
  const message = formatStatusMessage(response.status, body);

  if (response.status === 401) {
    throw new ReviewGatewayError('HTTP_ERROR', `${message} (unauthorized)`, {
      status: response.status,
    });
  }
  if (response.status === 403) {
    throw new ReviewGatewayError('HTTP_ERROR', `${message} (forbidden)`, {
      status: response.status,
    });
  }
  if (response.status === 404) {
    throw new ReviewGatewayError('HTTP_ERROR', `${message} (not found)`, {
      status: response.status,
    });
  }

  throw new ReviewGatewayError('HTTP_ERROR', message, { status: response.status });
}

export async function requestJson<T>(
  url: string | URL,
  options: RequestJsonOptions = {},
): Promise<T> {
  const fetchImpl = toFetchImpl(options.fetchImpl);
  const headers = buildHeaders(options.headers);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
    });

    await ensureOk(response);

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (err: unknown) {
    if (isReviewGatewayError(err)) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ReviewGatewayError('REQUEST_TIMEOUT', 'Request timed out.', {
        cause: err,
      });
    }
    throw new ReviewGatewayError(
      'REQUEST_FAILED',
      err instanceof Error ? err.message : String(err),
      {
        cause: err,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function requestText(
  url: string | URL,
  options: RequestJsonOptions = {},
): Promise<string> {
  const fetchImpl = toFetchImpl(options.fetchImpl);
  const headers = buildHeaders(options.headers);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
    });

    await ensureOk(response);
    return await response.text();
  } catch (err: unknown) {
    if (isReviewGatewayError(err)) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ReviewGatewayError('REQUEST_TIMEOUT', 'Request timed out.', {
        cause: err,
      });
    }
    throw new ReviewGatewayError(
      'REQUEST_FAILED',
      err instanceof Error ? err.message : String(err),
      {
        cause: err,
      },
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function requestPagedJson<T>(
  buildUrl: () => string | URL,
  options: RequestPagedJsonOptions = {},
): Promise<T[]> {
  const pageParam = options.pageParam ?? 'page';
  const perPageParam = options.perPageParam ?? 'per_page';
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 100;
  const results: T[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(String(buildUrl()));
    url.searchParams.set(pageParam, String(page));
    url.searchParams.set(perPageParam, String(pageSize));
    const items = await requestJson<T[]>(url, options);
    results.push(...items);
    if (items.length < pageSize) {
      break;
    }
  }

  return results;
}
