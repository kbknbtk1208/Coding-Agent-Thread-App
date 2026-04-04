import { describe, expect, it } from 'vitest';
import {
  buildCodexTurnStartRequest,
  getCodexStructuredResultSource,
  shouldUseCodexOutputSchema,
} from './codex-runtime';

describe('shouldUseCodexOutputSchema', () => {
  it('disables outputSchema for review-draft', () => {
    expect(
      shouldUseCodexOutputSchema({
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        structuredOutputMode: 'normal',
      }),
    ).toBe(false);
  });

  it('keeps outputSchema for other structured schemas', () => {
    expect(
      shouldUseCodexOutputSchema({
        responseMode: 'structured',
        structuredSchemaName: 'implementation-checklist',
        structuredOutputMode: 'normal',
      }),
    ).toBe(true);
  });

  it('disables outputSchema during forced fallback mode', () => {
    expect(
      shouldUseCodexOutputSchema({
        responseMode: 'structured',
        structuredSchemaName: 'implementation-checklist',
        structuredOutputMode: 'forceFallback',
      }),
    ).toBe(false);
  });

  it('omits outputSchema from turn/start for review-draft requests', () => {
    const request = buildCodexTurnStartRequest({
      cwd: 'C:/workspace',
      providerSessionId: 'thread-1',
      input: {
        messageId: 'message-1',
        prompt: 'レビューしてください',
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        structuredOutputMode: 'normal',
      },
    });

    expect(request.outputSchema).toBeUndefined();
    expect(request.input[0]?.text).toContain('返答は JSON オブジェクトのみで返してください。');
  });

  it('keeps outputSchema on turn/start for implementation-checklist requests', () => {
    const request = buildCodexTurnStartRequest({
      cwd: 'C:/workspace',
      providerSessionId: 'thread-1',
      input: {
        messageId: 'message-1',
        prompt: 'チェックしてください',
        responseMode: 'structured',
        structuredSchemaName: 'implementation-checklist',
        structuredOutputMode: 'normal',
      },
    });

    expect(request.outputSchema).toBeDefined();
  });

  it('uses promptedJson as the structured result source when outputSchema is disabled', () => {
    expect(getCodexStructuredResultSource(false)).toBe('promptedJson');
    expect(getCodexStructuredResultSource(true)).toBe('codexOutputSchema');
  });
});
