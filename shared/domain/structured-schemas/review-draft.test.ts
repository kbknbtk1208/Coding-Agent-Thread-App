import { describe, expect, it } from 'vitest';
import { getStructuredSchemaDescriptor } from './registry';

const descriptor = getStructuredSchemaDescriptor('review-draft');

function hasSchemaKeyword(value: unknown, keyword: string): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasSchemaKeyword(item, keyword));
  }

  if (Object.prototype.hasOwnProperty.call(value, keyword)) {
    return true;
  }

  return Object.values(value).some((item) => hasSchemaKeyword(item, keyword));
}

describe('review draft structured schema descriptor', () => {
  it('parses a valid review draft response', () => {
    const parsed = descriptor.parseText(`{
      "type": "review-draft",
      "summary": {
        "headline": "設計は概ね妥当",
        "overview": "ただし境界条件の扱いに抜けがあります。",
        "positives": ["責務分割が明確"],
        "risks": ["入力検証が不足"]
      },
      "findings": [
        {
          "findingId": "finding-1",
          "title": "入力検証が不足",
          "body": "不正な payload でも処理が続行されます。",
          "severity": "high",
          "category": "correctness",
          "confidence": "high",
          "suggestion": "早期 return を追加してください。",
          "location": {
            "kind": "diff",
            "filePath": "src/review.ts",
            "startLine": 10,
            "endLine": 12,
            "side": "new",
            "excerpt": "if (!input.userId)"
          }
        }
      ]
    }`);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.type).toBe('review-draft');
    expect(parsed.value.summary.headline).toBe('設計は概ね妥当');
    expect(parsed.value.findings).toHaveLength(1);
    expect(parsed.value.findings[0]?.location.kind).toBe('diff');
  });

  it('fails with schemaValidationFailed for invalid payloads', () => {
    const parsed = descriptor.parseText(`{
      "type": "review-draft",
      "summary": {
        "headline": "",
        "overview": "text",
        "positives": [],
        "risks": []
      },
      "findings": []
    }`);

    expect(parsed).toEqual({
      ok: false,
      reason: 'schemaValidationFailed',
    });
  });

  it('builds a prompt that requests JSON only', () => {
    const prompt = descriptor.buildPrompt('レビューしてください');

    expect(prompt).toContain('レビューしてください');
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('"type": "review-draft"');
  });

  it('uses a Codex-compatible output schema without oneOf', () => {
    expect(hasSchemaKeyword(descriptor.jsonSchema, 'oneOf')).toBe(false);
    expect(descriptor.jsonSchema).toMatchObject({
      properties: {
        findings: {
          items: {
            properties: {
              suggestion: {
                type: ['string', 'null'],
              },
              location: {
                properties: {
                  endLine: {
                    type: ['integer', 'null'],
                  },
                  excerpt: {
                    type: ['string', 'null'],
                  },
                  filePath: {
                    type: ['string', 'null'],
                  },
                  kind: {
                    enum: ['diff', 'overview'],
                  },
                  side: {
                    enum: ['old', 'new', null],
                    type: ['string', 'null'],
                  },
                  startLine: {
                    type: ['integer', 'null'],
                  },
                },
                required: ['kind', 'filePath', 'startLine', 'endLine', 'side', 'excerpt'],
                type: 'object',
              },
            },
          },
        },
      },
    });
    expect((descriptor.jsonSchema as any).properties.findings.items.required).toEqual(
      expect.arrayContaining([
        'findingId',
        'title',
        'body',
        'severity',
        'category',
        'confidence',
        'location',
        'suggestion',
      ]),
    );
  });
});
