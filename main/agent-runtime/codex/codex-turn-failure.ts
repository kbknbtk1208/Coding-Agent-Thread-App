export interface CodexTurnFailureDetail {
  message: string;
  codexErrorInfo?: unknown;
  additionalDetails?: unknown;
}

interface CodexTurnFailureEnvelope {
  error?: unknown;
  turn?: {
    error?: unknown;
  };
}

export function extractCodexTurnFailureDetail(value: unknown): CodexTurnFailureDetail | null {
  const envelope = isRecord(value) ? (value as CodexTurnFailureEnvelope) : null;
  if (!envelope) {
    return null;
  }

  const candidate = envelope.error ?? envelope.turn?.error;
  if (!isRecord(candidate)) {
    return null;
  }

  const message = getTrimmedString(candidate.message);
  if (!message) {
    return null;
  }

  return {
    message,
    codexErrorInfo: candidate.codexErrorInfo,
    additionalDetails: candidate.additionalDetails,
  };
}

export function buildCodexFailureError(detail: CodexTurnFailureDetail | null) {
  return {
    code: 'CODEX_TURN_FAILED',
    message: detail?.message ?? 'Codex turn failed.',
    retryable: false,
    codexErrorInfo: detail?.codexErrorInfo,
    additionalDetails: detail?.additionalDetails,
  };
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
