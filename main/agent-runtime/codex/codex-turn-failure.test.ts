import { describe, expect, it } from 'vitest';
import { buildCodexFailureError, extractCodexTurnFailureDetail } from './codex-turn-failure';

describe('codex turn failure helpers', () => {
  it('extracts details from turn.completed error payloads', () => {
    const detail = extractCodexTurnFailureDetail({
      turn: {
        error: {
          message: 'Request failed',
          codexErrorInfo: {
            httpStatusCode: 400,
            kind: 'BadRequest',
          },
          additionalDetails: {
            field: 'outputSchema',
          },
        },
      },
    });

    expect(detail).toEqual({
      message: 'Request failed',
      codexErrorInfo: {
        httpStatusCode: 400,
        kind: 'BadRequest',
      },
      additionalDetails: {
        field: 'outputSchema',
      },
    });
  });

  it('falls back to the top-level error envelope', () => {
    const detail = extractCodexTurnFailureDetail({
      error: {
        message: 'Upstream connection failed',
        codexErrorInfo: {
          kind: 'HttpConnectionFailed',
        },
      },
    });

    expect(detail?.message).toBe('Upstream connection failed');
    expect(detail?.codexErrorInfo).toEqual({
      kind: 'HttpConnectionFailed',
    });
  });

  it('builds a retryable flag-free Codex error envelope', () => {
    expect(
      buildCodexFailureError({
        message: 'Request failed',
        codexErrorInfo: { kind: 'BadRequest' },
        additionalDetails: { field: 'outputSchema' },
      }),
    ).toEqual({
      code: 'CODEX_TURN_FAILED',
      message: 'Request failed',
      retryable: false,
      codexErrorInfo: { kind: 'BadRequest' },
      additionalDetails: { field: 'outputSchema' },
    });
  });
});
