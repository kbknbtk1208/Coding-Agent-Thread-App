import { describe, expect, it } from 'vitest';
import { buildStructuredPrompt, getStructuredSchemaDescriptor } from './index';

describe('structured schema registry', () => {
  it('returns both implementation-checklist and review-draft descriptors', () => {
    const checklist = getStructuredSchemaDescriptor('implementation-checklist');
    const reviewDraft = getStructuredSchemaDescriptor('review-draft');

    expect(checklist.schemaName).toBe('implementation-checklist');
    expect(reviewDraft.schemaName).toBe('review-draft');
  });

  it('builds the review-draft prompt with overview fallback instructions', () => {
    const prompt = buildStructuredPrompt('review-draft', '保守性の観点でレビューして');

    expect(prompt).toContain('location.kind = "overview"');
    expect(prompt).toContain('findings は最大 8 件まで');
  });
});
