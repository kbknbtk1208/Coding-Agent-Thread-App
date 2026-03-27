import type {
  AgentKind,
  ConversationIntermediateSegment,
  ConversationTurn,
  ProgressHint,
} from './agent';

export const COPILOT_SEGMENT_GAP_MS = 500;

export function cloneIntermediateSegments(
  segments: ConversationIntermediateSegment[],
): ConversationIntermediateSegment[] {
  return segments.map((segment) => ({ ...segment }));
}

export function applyProgressHintToTurn(
  turn: ConversationTurn,
  progressHint: ProgressHint,
  now: string,
): ConversationTurn {
  const intermediateSegments = cloneIntermediateSegments(turn.intermediateSegments ?? []);
  const latestSegment = intermediateSegments.at(-1);

  if (latestSegment?.kind === 'progress') {
    latestSegment.progressKind = progressHint.kind;
    latestSegment.text = progressHint.text;
    latestSegment.updatedAt = now;
  } else {
    intermediateSegments.push({
      kind: 'progress',
      progressKind: progressHint.kind,
      segmentId: buildSegmentId(turn, intermediateSegments.length + 1),
      text: progressHint.text,
      updatedAt: now,
    });
  }

  return {
    ...turn,
    intermediateSegments,
    progressHint: { ...progressHint },
  };
}

export function applyMessageDeltaToTurn(
  turn: ConversationTurn,
  agent: AgentKind,
  text: string,
  now: string,
): ConversationTurn {
  const intermediateSegments = cloneIntermediateSegments(turn.intermediateSegments ?? []);
  const latestSegment = intermediateSegments.at(-1);

  if (!latestSegment) {
    intermediateSegments.push(
      createMessageSegment(turn, intermediateSegments.length + 1, text, now),
    );
  } else if (latestSegment.kind === 'progress') {
    intermediateSegments[intermediateSegments.length - 1] = {
      kind: 'message',
      progressKind: undefined,
      segmentId: latestSegment.segmentId,
      text,
      updatedAt: now,
    };
  } else if (shouldAppendToMessageSegment(agent, latestSegment.updatedAt, now)) {
    latestSegment.text += text;
    latestSegment.updatedAt = now;
  } else {
    intermediateSegments.push(
      createMessageSegment(turn, intermediateSegments.length + 1, text, now),
    );
  }

  return {
    ...turn,
    intermediateSegments,
    progressHint: undefined,
    response: turn.response + text,
  };
}

function shouldAppendToMessageSegment(agent: AgentKind, previousUpdatedAt: string, now: string) {
  if (agent !== 'copilot') {
    return true;
  }

  return toEpochMs(now) - toEpochMs(previousUpdatedAt) <= COPILOT_SEGMENT_GAP_MS;
}

function createMessageSegment(
  turn: ConversationTurn,
  nextIndex: number,
  text: string,
  updatedAt: string,
): ConversationIntermediateSegment {
  return {
    kind: 'message',
    segmentId: buildSegmentId(turn, nextIndex),
    text,
    updatedAt,
  };
}

function buildSegmentId(turn: ConversationTurn, nextIndex: number) {
  return `${turn.turnId}:segment:${nextIndex}`;
}

function toEpochMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
