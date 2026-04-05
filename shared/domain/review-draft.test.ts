import { describe, expect, it } from 'vitest';
import {
  buildReviewDraftPrompt,
  normalizeReviewDraftStructuredResult,
  parseReviewDraftResponse,
} from './review-draft';

describe('review-draft parser', () => {
  it('parses a valid structured review draft response', () => {
    const parsed = parseReviewDraftResponse(`{
      "type": "review-draft",
      "summary": {
        "headline": "主にテスト不足が目立ちます",
        "overview": "正常系は読めるが回帰検知が弱いです。",
        "positives": ["責務分離は明確です"],
        "risks": ["テストが不足しています"]
      },
      "findings": [
        {
          "findingId": "f1",
          "title": "回帰テストがない",
          "body": "分岐追加に対してテストがありません。",
          "severity": "high",
          "category": "tests",
          "confidence": "high",
          "suggestion": "ユニットテストを追加してください。",
          "location": {
            "kind": "diff",
            "filePath": "main/review-gateway/review-gateway.ts",
            "startLine": 10,
            "endLine": 12,
            "side": "new",
            "excerpt": "return {\\n  foo: bar\\n}"
          }
        }
      ]
    }`);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.value.findings).toHaveLength(1);
    expect(parsed.value.findings[0]?.location.kind).toBe('diff');
  });

  it('fails when the schema is invalid', () => {
    const parsed = parseReviewDraftResponse(`{
      "type": "review-draft",
      "summary": {
        "headline": "headline",
        "overview": "overview",
        "positives": [],
        "risks": []
      },
      "findings": [
        {
          "findingId": "f1",
          "title": "title",
          "body": "body",
          "severity": "critical",
          "category": "tests",
          "confidence": "high",
          "location": { "kind": "overview" }
        }
      ]
    }`);

    expect(parsed).toEqual({
      ok: false,
      reason: 'schemaValidationFailed',
    });
  });

  it('builds a prompt that treats excerpt as advisory', () => {
    const prompt = buildReviewDraftPrompt('レビューしてください');

    expect(prompt).toContain('レビューしてください');
    expect(prompt).toContain('type は "review-draft" に固定してください。');
    expect(prompt).toContain('location.kind = "overview"');
    expect(prompt).toContain(
      'excerpt は changed-side の本文を verbatim で確実に抜ける場合だけ使い、少しでも怪しければ null にしてください。',
    );
    expect(prompt).toContain('"excerpt": null');
  });

  it('normalizes overview findings and auto-fills missing ids', () => {
    const normalized = normalizeReviewDraftStructuredResult({
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: ['a'],
        risks: ['b'],
      },
      findings: [
        {
          title: 'Overview finding',
          body: 'details',
          severity: 'low',
          category: 'docs',
          confidence: 'medium',
          location: { kind: 'overview' },
        },
      ],
    });

    expect(normalized?.findings[0]?.findingId).toBe('finding-1');
    expect(normalized?.findings[0]?.location).toEqual({ kind: 'overview' });
  });

  it('normalizes overview findings even when Codex-required nullable fields are present', () => {
    const normalized = normalizeReviewDraftStructuredResult({
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: ['a'],
        risks: ['b'],
      },
      findings: [
        {
          findingId: 'finding-1',
          title: 'Overview finding',
          body: 'details',
          severity: 'low',
          category: 'docs',
          confidence: 'medium',
          suggestion: null,
          location: {
            kind: 'overview',
            filePath: null,
            startLine: null,
            endLine: null,
            side: null,
            excerpt: null,
          },
        },
      ],
    });

    expect(normalized?.findings[0]?.suggestion).toBeUndefined();
    expect(normalized?.findings[0]?.location).toEqual({ kind: 'overview' });
  });

  it('normalizes diff findings when excerpt is explicitly null', () => {
    const normalized = normalizeReviewDraftStructuredResult({
      type: 'review-draft',
      summary: {
        headline: 'headline',
        overview: 'overview',
        positives: ['a'],
        risks: ['b'],
      },
      findings: [
        {
          findingId: 'finding-1',
          title: 'Diff finding',
          body: 'details',
          severity: 'medium',
          category: 'correctness',
          confidence: 'high',
          suggestion: null,
          location: {
            kind: 'diff',
            filePath: 'src/example.ts',
            startLine: 10,
            endLine: 12,
            side: 'new',
            excerpt: null,
          },
        },
      ],
    });

    expect(normalized?.findings[0]?.location).toEqual({
      kind: 'diff',
      filePath: 'src/example.ts',
      startLine: 10,
      endLine: 12,
      side: 'new',
    });
  });
});
