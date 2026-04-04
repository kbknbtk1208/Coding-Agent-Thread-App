import type { AgentKind, StructuredResultSource } from './agent';
import type { ReviewAnchor, ReviewDiscussionLocation } from './review';

export const REVIEW_DRAFT_SCHEMA_NAME = 'review-draft' as const;

export type ReviewFindingSeverity = 'high' | 'medium' | 'low';

export type ReviewFindingCategory =
  | 'design'
  | 'correctness'
  | 'tests'
  | 'maintainability'
  | 'performance'
  | 'security'
  | 'docs';

export type ReviewFindingConfidence = 'high' | 'medium' | 'low';

export interface ReviewSummaryDraft {
  headline: string;
  overview: string;
  positives: string[];
  risks: string[];
}

export type ReviewFindingLocationInput =
  | {
      kind: 'diff';
      filePath: string;
      startLine: number | null;
      endLine: number | null;
      side: 'old' | 'new';
      excerpt?: string;
    }
  | {
      kind: 'overview';
    };

export interface ReviewFindingDraft {
  findingId: string;
  title: string;
  body: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  suggestion?: string;
  location: ReviewFindingLocationInput;
}

export interface ReviewDraftStructuredResult {
  type: typeof REVIEW_DRAFT_SCHEMA_NAME;
  summary: ReviewSummaryDraft;
  findings: ReviewFindingDraft[];
}

export type ReviewDraftParseFailureReason =
  | 'emptyResponse'
  | 'jsonParseFailed'
  | 'schemaValidationFailed';

export type ReviewDraftParseResult =
  | {
      ok: true;
      value: ReviewDraftStructuredResult;
    }
  | {
      ok: false;
      reason: ReviewDraftParseFailureReason;
    };

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

export interface ReviewRunRecord {
  runId: string;
  snapshotId: string;
  reviewAgent: AgentKind;
  lensId: string;
  instructions: string;
  rootAppSessionId: string;
  status: 'drafting_review' | 'completed' | 'fallback_rich_text' | 'failed';
  resultSource: StructuredResultSource | 'richText';
  createdAt: string;
  completedAt?: string;
}

export interface ReviewThreadDraft {
  localThreadId: string;
  snapshotId: string;
  runId: string;
  findingId: string;
  source: 'ai-review';
  state: 'draft' | 'edited' | 'dismissed';
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  title: string;
  draftBody: string;
  suggestion?: string;
  resolvedLocation: ReviewDiscussionLocation;
  anchor: ReviewAnchor | null;
}

export type ReviewDraftFallbackReason =
  | 'structuredParseFailed'
  | 'schemaValidationFailed'
  | 'emptyResponse';

export type ReviewDraftEnvelope =
  | {
      kind: 'structured';
      run: ReviewRunRecord;
      summary: ReviewSummaryDraft;
      threads: ReviewThreadDraft[];
    }
  | {
      kind: 'fallback-richText';
      run: ReviewRunRecord;
      content: string;
      reason: ReviewDraftFallbackReason;
    };

export const REVIEW_DRAFT_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    findings: {
      items: {
        additionalProperties: false,
        properties: {
          body: { type: 'string' },
          category: {
            enum: [
              'design',
              'correctness',
              'tests',
              'maintainability',
              'performance',
              'security',
              'docs',
            ],
            type: 'string',
          },
          confidence: {
            enum: ['high', 'medium', 'low'],
            type: 'string',
          },
          findingId: { type: 'string' },
          location: REVIEW_FINDING_LOCATION_SCHEMA,
          severity: {
            enum: ['high', 'medium', 'low'],
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
      maxItems: 8,
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

export function buildReviewDraftPrompt(prompt: string) {
  return [
    prompt.trim(),
    '',
    '返答は JSON オブジェクトのみで返してください。',
    'Markdown コードフェンス、前置き、補足説明は禁止です。',
    'line が不確実な場合は location.kind に overview を使ってください。',
    'severity は high / medium / low のいずれかにしてください。',
    'findings は最大 8 件までにしてください。',
    'schema:',
    '{',
    '  "type": "review-draft",',
    '  "summary": {',
    '    "headline": "重大な問題は少ないが入力検証に改善余地がある",',
    '    "overview": "全体として責務分割は明確だが、境界条件の扱いに抜けがある。",',
    '    "positives": ["責務が分かれている"],',
    '    "risks": ["入力検証が不足している"]',
    '  },',
    '  "findings": [',
    '    {',
    '      "findingId": "finding-1",',
    '      "title": "入力検証が不足",',
    '      "body": "不正な payload でも処理が継続されます。",',
    '      "severity": "high",',
    '      "category": "correctness",',
    '      "confidence": "high",',
    '      "suggestion": "早期 return を追加してください。",',
    '      "location": {',
    '        "kind": "diff",',
    '        "filePath": "src/review.ts",',
    '        "startLine": 10,',
    '        "endLine": 12,',
    '        "side": "new",',
    '        "excerpt": "if (!input.userId)"',
    '      }',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

export function buildReviewDraftFallbackPrompt(prompt: string) {
  return [
    prompt.trim(),
    '',
    'これは structured fallback の検証です。',
    'JSON オブジェクト、コードフェンス、schema 形式の出力は禁止です。',
    '代わりに Markdown で、総評と指摘を 3 件以内の箇条書きで返してください。',
  ].join('\n');
}

export function parseReviewDraftResponse(text: string): ReviewDraftParseResult {
  const candidate = extractJsonCandidate(text);
  if (!candidate.ok) {
    return candidate;
  }

  const normalized = normalizeReviewDraft(candidate.value);
  if (normalized) {
    return {
      ok: true,
      value: normalized,
    };
  }

  return {
    ok: false,
    reason: 'schemaValidationFailed',
  };
}

export function normalizeReviewDraft(value: unknown): ReviewDraftStructuredResult | null {
  if (!isRecord(value) || value.type !== REVIEW_DRAFT_SCHEMA_NAME) {
    return null;
  }

  const summary = normalizeReviewSummary(value.summary);
  if (!summary) {
    return null;
  }

  if (!Array.isArray(value.findings) || value.findings.length > 8) {
    return null;
  }

  const findings = value.findings
    .map((item, index) => normalizeReviewFinding(item, index))
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

export const normalizeReviewDraftStructuredResult = normalizeReviewDraft;

export function cloneReviewDraftStructuredResult(
  reviewDraft: ReviewDraftStructuredResult,
): ReviewDraftStructuredResult {
  return {
    type: REVIEW_DRAFT_SCHEMA_NAME,
    summary: {
      headline: reviewDraft.summary.headline,
      overview: reviewDraft.summary.overview,
      positives: [...reviewDraft.summary.positives],
      risks: [...reviewDraft.summary.risks],
    },
    findings: reviewDraft.findings.map((finding) => ({
      ...finding,
      location:
        finding.location.kind === 'overview'
          ? { kind: 'overview' as const }
          : { ...finding.location },
    })),
  };
}

export function summarizeReviewDraftStructuredResult(
  reviewDraft: ReviewDraftStructuredResult,
): string {
  return `Review draft: ${String(reviewDraft.findings.length)} findings`;
}

function normalizeReviewSummary(value: unknown): ReviewSummaryDraft | null {
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

function normalizeReviewFinding(value: unknown, index: number): ReviewFindingDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getTrimmedString(value.title);
  const body = getTrimmedString(value.body);
  const severity = normalizeSeverity(value.severity);
  const category = normalizeCategory(value.category);
  const confidence = normalizeConfidence(value.confidence);
  const location = normalizeLocation(value.location);

  if (!title || !body || !severity || !category || !confidence || !location) {
    return null;
  }

  return {
    findingId: getTrimmedString(value.findingId) ?? `finding-${index + 1}`,
    title,
    body,
    severity,
    category,
    confidence,
    suggestion: getTrimmedString(value.suggestion) ?? undefined,
    location,
  };
}

function normalizeLocation(value: unknown): ReviewFindingLocationInput | null {
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
  const startLine = normalizeNullableLine(value.startLine);
  const endLine = normalizeNullableLine(value.endLine);
  const side = value.side === 'old' || value.side === 'new' ? value.side : null;
  const excerpt = getTrimmedString(value.excerpt) ?? undefined;

  if (!filePath || startLine === undefined || endLine === undefined || !side) {
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

function normalizeNullableLine(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return undefined;
  }
  return value;
}

function normalizeSeverity(value: unknown): ReviewFindingSeverity | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function normalizeCategory(value: unknown): ReviewFindingCategory | null {
  switch (value) {
    case 'design':
    case 'correctness':
    case 'tests':
    case 'maintainability':
    case 'performance':
    case 'security':
    case 'docs':
      return value;
    default:
      return null;
  }
}

function normalizeConfidence(value: unknown): ReviewFindingConfidence | null {
  return value === 'high' || value === 'medium' || value === 'low' ? value : null;
}

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value
    .map((item) => getTrimmedString(item))
    .filter((item): item is string => item !== null);
}

function extractJsonCandidate(text: string): ReviewDraftParseResult | { ok: true; value: unknown } {
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
