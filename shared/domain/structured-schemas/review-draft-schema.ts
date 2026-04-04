import {
  REVIEW_DRAFT_SCHEMA_NAME,
  type ReviewDraftStructuredResult,
  type ReviewFindingDraft,
  type ReviewFindingLocationInput,
  type ReviewFindingCategory,
  type ReviewFindingConfidence,
  type ReviewFindingSeverity,
  type ReviewSummaryDraft,
} from '../review-draft';
import type {
  StructuredSchemaDescriptor,
  StructuredSchemaParseFailureReason,
  StructuredSchemaParseResult,
} from './types';

const MAX_FINDINGS = 8;

const REVIEW_FINDING_SEVERITIES = ['high', 'medium', 'low'] as const;
const REVIEW_FINDING_CATEGORIES = [
  'design',
  'correctness',
  'tests',
  'maintainability',
  'performance',
  'security',
  'docs',
] as const;
const REVIEW_FINDING_CONFIDENCE = ['high', 'medium', 'low'] as const;
const REVIEW_FINDING_LOCATION_SCHEMA = {
  additionalProperties: false,
  properties: {
    endLine: { type: ['integer', 'null'] },
    excerpt: { type: ['string', 'null'] },
    filePath: { type: ['string', 'null'] },
    kind: {
      enum: ['diff', 'overview'],
      type: 'string',
    },
    side: {
      enum: ['old', 'new', null],
      type: ['string', 'null'],
    },
    startLine: { type: ['integer', 'null'] },
  },
  required: ['kind', 'filePath', 'startLine', 'endLine', 'side', 'excerpt'],
  type: 'object',
} as const;

export const REVIEW_DRAFT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    findings: {
      items: {
        additionalProperties: false,
        properties: {
          body: { type: 'string' },
          category: {
            enum: REVIEW_FINDING_CATEGORIES,
            type: 'string',
          },
          confidence: {
            enum: REVIEW_FINDING_CONFIDENCE,
            type: 'string',
          },
          findingId: { type: 'string' },
          location: REVIEW_FINDING_LOCATION_SCHEMA,
          severity: {
            enum: REVIEW_FINDING_SEVERITIES,
            type: 'string',
          },
          suggestion: { type: ['string', 'null'] },
          title: { type: 'string' },
        },
        required: [
          'findingId',
          'title',
          'body',
          'severity',
          'category',
          'confidence',
          'location',
          'suggestion',
        ],
        type: 'object',
      },
      maxItems: MAX_FINDINGS,
      type: 'array',
    },
    summary: {
      additionalProperties: false,
      properties: {
        headline: { type: 'string' },
        overview: { type: 'string' },
        positives: {
          items: { type: 'string' },
          type: 'array',
        },
        risks: {
          items: { type: 'string' },
          type: 'array',
        },
      },
      required: ['headline', 'overview', 'positives', 'risks'],
      type: 'object',
    },
    type: {
      const: REVIEW_DRAFT_SCHEMA_NAME,
      type: 'string',
    },
  },
  required: ['type', 'summary', 'findings'],
  type: 'object',
} as const;

export const reviewDraftSchemaDescriptor: StructuredSchemaDescriptor<'review-draft'> = {
  schemaName: REVIEW_DRAFT_SCHEMA_NAME,
  jsonSchema: REVIEW_DRAFT_JSON_SCHEMA,
  buildPrompt(prompt: string) {
    const trimmedPrompt = prompt.trim();
    return [
      trimmedPrompt,
      '',
      '返答は JSON オブジェクトのみで返してください。',
      'Markdown コードフェンス、前置き、補足説明は禁止です。',
      'schemaName は "review-draft" に固定してください。',
      'summary と findings は必須です。',
      `findings は最大 ${String(MAX_FINDINGS)} 件までにしてください。`,
      'severity は high / medium / low のいずれかです。',
      'category は design / correctness / tests / maintainability / performance / security / docs のいずれかです。',
      'confidence は high / medium / low のいずれかです。',
      'line や filePath に確信が持てない場合は、location.kind = "overview" を返してください。',
      'location.kind が "overview" の場合、filePath / startLine / endLine / side / excerpt は null にしてください。',
      'suggestion を出せない場合は null にしてください。',
      'excerpt を含める場合は 1 から 3 行程度の短い断片にしてください。',
      'structured fields に markdown やコードフェンスを含めないでください。',
      'schema:',
      '{',
      '  "type": "review-draft",',
      '  "summary": {',
      '    "headline": "string",',
      '    "overview": "string",',
      '    "positives": ["string"],',
      '    "risks": ["string"]',
      '  },',
      '  "findings": [',
      '    {',
      '      "findingId": "finding-1",',
      '      "title": "string",',
      '      "body": "string",',
      '      "severity": "high",',
      '      "category": "correctness",',
      '      "confidence": "medium",',
      '      "suggestion": "string",',
      '      "location": {',
      '        "kind": "diff",',
      '        "filePath": "src/example.ts",',
      '        "startLine": 10,',
      '        "endLine": 12,',
      '        "side": "new",',
      '        "excerpt": "short excerpt"',
      '      }',
      '    }',
      '  ]',
      '}',
    ].join('\n');
  },
  buildForcedFallbackPrompt(prompt: string) {
    return [
      prompt.trim(),
      '',
      'これは structured fallback UI の検証です。',
      'JSON オブジェクト、コードフェンス、schema 形式の出力は禁止です。',
      '代わりに Markdown で、総評・良い点・懸念点・指摘案を簡潔に返してください。',
    ].join('\n');
  },
  parseText(text: string) {
    const candidate = extractJsonCandidate(text);
    if (!candidate.ok) {
      return candidate;
    }

    const normalized = normalizeReviewDraftStructuredResult(candidate.value);
    if (!normalized) {
      return {
        ok: false,
        reason: 'schemaValidationFailed',
      };
    }

    return {
      ok: true,
      value: normalized,
    };
  },
  normalize: normalizeReviewDraftStructuredResult,
  describeParseFailure(
    reason: StructuredSchemaParseFailureReason,
    options?: { usesOutputSchema?: boolean },
  ) {
    switch (reason) {
      case 'emptyResponse':
        return options?.usesOutputSchema
          ? 'Codex の outputSchema 応答が空でした。'
          : 'review draft の応答が空でした。';
      case 'schemaValidationFailed':
        return options?.usesOutputSchema
          ? 'Codex の outputSchema 応答は取得できましたが review draft schema に合致しませんでした。'
          : 'JSON は取得できましたが review draft schema に合致しませんでした。';
      case 'jsonParseFailed':
      default:
        return options?.usesOutputSchema
          ? 'Codex の outputSchema 応答を JSON として解釈できませんでした。'
          : 'review draft を JSON として解釈できませんでした。';
    }
  },
};

export function normalizeReviewDraftStructuredResult(
  value: unknown,
): ReviewDraftStructuredResult | null {
  if (!isRecord(value) || value.type !== REVIEW_DRAFT_SCHEMA_NAME) {
    return null;
  }

  const summary = normalizeReviewSummaryDraft(value.summary);
  if (!summary) {
    return null;
  }

  if (!Array.isArray(value.findings) || value.findings.length > MAX_FINDINGS) {
    return null;
  }

  const findings = value.findings
    .map((item, index) => normalizeReviewFindingDraft(item, index))
    .filter((item): item is ReviewFindingDraft => item !== null);

  if (findings.length !== value.findings.length) {
    return null;
  }

  return {
    type: REVIEW_DRAFT_SCHEMA_NAME,
    summary,
    findings,
  };
}

function normalizeReviewSummaryDraft(value: unknown): ReviewSummaryDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const headline = getTrimmedString(value.headline);
  const overview = getTrimmedString(value.overview);
  const positives = normalizeStringList(value.positives);
  const risks = normalizeStringList(value.risks);

  if (!headline || !overview || !positives || !risks) {
    return null;
  }

  return {
    headline,
    overview,
    positives,
    risks,
  };
}

function normalizeReviewFindingDraft(value: unknown, index: number): ReviewFindingDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getTrimmedString(value.title);
  const body = getTrimmedString(value.body);
  const severity = normalizeEnumValue(value.severity, REVIEW_FINDING_SEVERITIES);
  const category = normalizeEnumValue(value.category, REVIEW_FINDING_CATEGORIES);
  const confidence = normalizeEnumValue(value.confidence, REVIEW_FINDING_CONFIDENCE);
  const location = normalizeReviewFindingLocation(value.location);

  if (!title || !body || !severity || !category || !confidence || !location) {
    return null;
  }

  return {
    findingId: getTrimmedString(value.findingId) ?? `finding-${String(index + 1)}`,
    title,
    body,
    severity: severity as ReviewFindingSeverity,
    category: category as ReviewFindingCategory,
    confidence: confidence as ReviewFindingConfidence,
    suggestion: getTrimmedString(value.suggestion) ?? undefined,
    location,
  };
}

function normalizeReviewFindingLocation(value: unknown): ReviewFindingLocationInput | null {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    return null;
  }

  if (value.kind === 'overview') {
    return { kind: 'overview' };
  }

  if (value.kind !== 'diff') {
    return null;
  }

  const filePath = getTrimmedString(value.filePath);
  const startLine = normalizeNullableLineNumber(value.startLine);
  const endLine = normalizeNullableLineNumber(value.endLine);
  const side = normalizeEnumValue(value.side, ['old', 'new'] as const);
  const excerpt = getTrimmedString(value.excerpt) ?? undefined;

  if (!filePath || !side || startLine === undefined || endLine === undefined) {
    return null;
  }

  return {
    kind: 'diff',
    filePath,
    startLine,
    endLine,
    side,
    excerpt,
  };
}

function normalizeNullableLineNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return undefined;
}

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((item) => getTrimmedString(item))
    .filter((item): item is string => item !== null);

  return normalized.length === value.length ? normalized : null;
}

function normalizeEnumValue<TValue extends string>(
  value: unknown,
  candidates: readonly TValue[],
): TValue | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return candidates.includes(normalized as TValue) ? (normalized as TValue) : null;
}

function extractJsonCandidate(
  text: string,
): StructuredSchemaParseResult<ReviewDraftStructuredResult> | { ok: true; value: unknown } {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason: 'emptyResponse',
    };
  }

  const direct = tryParseJson(trimmed);
  if (direct !== null) {
    return {
      ok: true,
      value: direct,
    };
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fenced = tryParseJson(fencedMatch[1].trim());
    if (fenced !== null) {
      return {
        ok: true,
        value: fenced,
      };
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = tryParseJson(trimmed.slice(firstBrace, lastBrace + 1));
    if (sliced !== null) {
      return {
        ok: true,
        value: sliced,
      };
    }
  }

  return {
    ok: false,
    reason: 'jsonParseFailed',
  };
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
