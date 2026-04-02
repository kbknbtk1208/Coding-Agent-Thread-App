import { describe, expect, it, vi } from 'vitest';
import { requestJson, requestPagedJson } from './request-json';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

describe('request helpers', () => {
  it('paginates until a short page is returned', async () => {
    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get('page') === '1') {
        return jsonResponse([{ id: 1 }, { id: 2 }]);
      }
      return jsonResponse([]);
    });

    const result = await requestPagedJson(() => 'https://example.com/items', {
      fetchImpl,
      pageSize: 2,
    });

    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces HTTP status failures with the status code', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 404 }));

    await expect(requestJson('https://example.com/missing', { fetchImpl })).rejects.toThrow(
      /HTTP 404/,
    );
  });
});
