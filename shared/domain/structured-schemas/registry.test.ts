import { describe, expect, it } from 'vitest';
import { getStructuredSchemaDescriptor } from './registry';

describe('structured schema registry', () => {
  it('returns the implementation checklist descriptor', () => {
    const descriptor = getStructuredSchemaDescriptor('implementation-checklist');

    expect(descriptor.schemaName).toBe('implementation-checklist');
    expect(typeof descriptor.buildPrompt).toBe('function');
    expect(descriptor.jsonSchema).toBeTruthy();
  });

  it('returns the review draft descriptor', () => {
    const descriptor = getStructuredSchemaDescriptor('review-draft');

    expect(descriptor.schemaName).toBe('review-draft');
    expect(typeof descriptor.buildPrompt).toBe('function');
    expect(descriptor.jsonSchema).toBeTruthy();
  });
});
