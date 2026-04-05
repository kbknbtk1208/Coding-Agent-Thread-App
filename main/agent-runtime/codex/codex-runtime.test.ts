import { describe, expect, it } from 'vitest';
import { getStructuredSchemaDescriptor } from '../../../shared/domain/structured-schemas';
import {
  buildCodexTurnStartRequest,
  getCodexStructuredResultSource,
  shouldUseCodexOutputSchema,
} from './codex-runtime';

describe('shouldUseCodexOutputSchema', () => {
  it('enables outputSchema for review-draft', () => {
    expect(
      shouldUseCodexOutputSchema({
        responseMode: 'structured',
        structuredSchemaName: 'review-draft',
        structuredOutputMode: 'normal',
      }),
    ).toBe(true);
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

  it('includes outputSchema in turn/start for review-draft requests', () => {
    const descriptor = getStructuredSchemaDescriptor('review-draft');
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

    expect(request.outputSchema).toEqual(descriptor.jsonSchema);
    expect(request.input[0]?.text).toContain('返答は JSON オブジェクトのみで返してください。');
    expect(request.input[0]?.text).toContain('type は "review-draft" に固定してください。');
    expect(request.input[0]?.text).toContain(
      'excerpt は changed-side の本文を verbatim で確実に抜ける場合だけ使い、少しでも怪しければ null にしてください。',
    );
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

  it('reports codexOutputSchema as the structured result source for review-draft requests', () => {
    const usesOutputSchema = shouldUseCodexOutputSchema({
      responseMode: 'structured',
      structuredSchemaName: 'review-draft',
      structuredOutputMode: 'normal',
    });

    expect(getCodexStructuredResultSource(usesOutputSchema)).toBe('codexOutputSchema');
  });

  it('uses promptedJson as the structured result source when outputSchema is disabled', () => {
    expect(getCodexStructuredResultSource(false)).toBe('promptedJson');
    expect(getCodexStructuredResultSource(true)).toBe('codexOutputSchema');
  });
});
