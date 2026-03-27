export const IMPLEMENTATION_CHECKLIST_SCHEMA_NAME = 'implementation-checklist' as const;

export type ChecklistPriority = 'high' | 'medium' | 'low';

export interface ImplementationChecklistItem {
  id: string;
  title: string;
  reason: string;
  priority: ChecklistPriority;
}

export interface ImplementationChecklist {
  type: typeof IMPLEMENTATION_CHECKLIST_SCHEMA_NAME;
  items: ImplementationChecklistItem[];
}

export type ImplementationChecklistParseFailureReason =
  | 'emptyResponse'
  | 'jsonParseFailed'
  | 'schemaValidationFailed';

export type ImplementationChecklistParseResult =
  | {
      ok: true;
      value: ImplementationChecklist;
    }
  | {
      ok: false;
      reason: ImplementationChecklistParseFailureReason;
    };

export const IMPLEMENTATION_CHECKLIST_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    items: {
      items: {
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          priority: {
            enum: ['high', 'medium', 'low'],
            type: 'string',
          },
          reason: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['id', 'title', 'reason', 'priority'],
        type: 'object',
      },
      minItems: 1,
      type: 'array',
    },
    type: {
      const: IMPLEMENTATION_CHECKLIST_SCHEMA_NAME,
      type: 'string',
    },
  },
  required: ['type', 'items'],
  type: 'object',
} as const;

export function buildImplementationChecklistPrompt(prompt: string) {
  return [
    prompt.trim(),
    '',
    '返答は JSON オブジェクトのみで返してください。',
    'Markdown コードフェンス、前置き、補足説明は禁止です。',
    'schema:',
    '{',
    '  "type": "implementation-checklist",',
    '  "items": [',
    '    {',
    '      "id": "lint-and-typecheck",',
    '      "title": "Lint と typecheck を先に通す",',
    '      "reason": "回帰を早く検知するため",',
    '      "priority": "high"',
    '    }',
    '  ]',
    '}',
    'priority は high / medium / low のいずれかにしてください。',
  ].join('\n');
}

export function parseImplementationChecklistText(text: string): ImplementationChecklist | null {
  const parsed = parseImplementationChecklistResponse(text);
  return parsed.ok ? parsed.value : null;
}

export function parseImplementationChecklistResponse(
  text: string,
): ImplementationChecklistParseResult {
  const candidate = extractJsonCandidate(text);
  if (!candidate.ok) {
    return candidate;
  }

  const normalized = normalizeImplementationChecklist(candidate.value);
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

export function normalizeImplementationChecklist(value: unknown): ImplementationChecklist | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.type !== IMPLEMENTATION_CHECKLIST_SCHEMA_NAME) {
    return null;
  }

  const rawItems = value.items;
  if (!Array.isArray(rawItems)) {
    return null;
  }

  const items = rawItems
    .map((item, index) => normalizeImplementationChecklistItem(item, index))
    .filter((item): item is ImplementationChecklistItem => item !== null);

  if (items.length === 0) {
    return null;
  }

  return {
    items,
    type: IMPLEMENTATION_CHECKLIST_SCHEMA_NAME,
  };
}

function normalizeImplementationChecklistItem(
  value: unknown,
  index: number,
): ImplementationChecklistItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = getTrimmedString(value.title);
  const reason = getTrimmedString(value.reason);
  const priority = normalizeChecklistPriority(value.priority);

  if (!title || !reason || !priority) {
    return null;
  }

  return {
    id: getTrimmedString(value.id) ?? createChecklistItemId(title, index),
    priority,
    reason,
    title,
  };
}

function normalizeChecklistPriority(value: unknown): ChecklistPriority | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized;
  }

  return null;
}

function createChecklistItemId(title: string, index: number) {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || `item-${index + 1}`;
}

function extractJsonCandidate(
  text: string,
): ImplementationChecklistParseResult | { ok: true; value: unknown } {
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
