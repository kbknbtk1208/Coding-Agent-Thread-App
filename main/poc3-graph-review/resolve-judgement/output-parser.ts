import type {
  ResolveJudgementAgentOutput,
  ResolveJudgementAgentOutputItem,
  ResolveJudgementCommentType,
  ResolveJudgementDecision,
} from '../../../shared/poc3-domain/resolve-judgement';

export type ResolveJudgementParseResult =
  | { ok: true; output: ResolveJudgementAgentOutput }
  | { ok: false; reason: 'emptyResponse' | 'jsonParseFailed' | 'schemaValidationFailed' };

export function parseResolveJudgementOutput(text: string): ResolveJudgementParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'emptyResponse' };
  }
  const candidate = extractJson(trimmed);
  if (!candidate.ok) {
    return candidate;
  }
  const value = candidate.value;
  if (!isRecord(value) || !Array.isArray(value.results)) {
    return { ok: false, reason: 'schemaValidationFailed' };
  }
  const results: ResolveJudgementAgentOutputItem[] = [];
  for (const raw of value.results) {
    if (!isRecord(raw)) {
      return { ok: false, reason: 'schemaValidationFailed' };
    }
    const commentType = normalizeCommentType(raw.commentType);
    const commentId = typeof raw.commentId === 'string' ? raw.commentId.trim() : '';
    const decision = normalizeDecision(raw.decision);
    const reasonMarkdown = typeof raw.reasonMarkdown === 'string' ? raw.reasonMarkdown.trim() : '';
    const evidence = normalizeEvidence(raw.evidence);
    if (!commentType || !commentId || !decision || !reasonMarkdown) {
      return { ok: false, reason: 'schemaValidationFailed' };
    }
    results.push({ commentType, commentId, decision, reasonMarkdown, evidence });
  }
  return { ok: true, output: { results } };
}

function normalizeCommentType(value: unknown): ResolveJudgementCommentType | null {
  if (value === 'agent-thread' || value === 'remote-thread') return value;
  return null;
}

function normalizeDecision(value: unknown): ResolveJudgementDecision | null {
  if (value === 'resolvable' || value === 'unresolvable') return value;
  return null;
}

function normalizeEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) result.push(trimmed);
    }
  }
  return result;
}

type ExtractResult = { ok: true; value: unknown } | { ok: false; reason: 'jsonParseFailed' };

function extractJson(text: string): ExtractResult {
  const direct = tryParseJson(text);
  if (direct !== undefined) return { ok: true, value: direct };
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    const parsed = tryParseJson(fence[1].trim());
    if (parsed !== undefined) return { ok: true, value: parsed };
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const parsed = tryParseJson(text.slice(first, last + 1));
    if (parsed !== undefined) return { ok: true, value: parsed };
  }
  return { ok: false, reason: 'jsonParseFailed' };
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
