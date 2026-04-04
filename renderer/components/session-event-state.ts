import type {
  AgentEvent,
  AgentStatus,
  AppSession,
  ConversationIntermediateSegment,
  ConversationTurn,
  PendingPermission,
} from '../../shared/domain/agent';
import {
  applyMessageDeltaToTurn,
  applyProgressHintToTurn,
  cloneIntermediateSegments,
} from '../../shared/domain/intermediate-segments';

function clonePendingPermission(permission: PendingPermission): PendingPermission {
  return {
    ...permission,
    actions: permission.actions.map((action) => ({ ...action })),
    payload:
      permission.payload && typeof permission.payload === 'object'
        ? Array.isArray(permission.payload)
          ? [...permission.payload]
          : { ...permission.payload }
        : permission.payload,
  };
}

function clonePendingPermissions(pendingPermissions: PendingPermission[]) {
  return pendingPermissions.map((permission) => clonePendingPermission(permission));
}

function patchLatestTurn(
  turns: ConversationTurn[],
  updater: (turn: ConversationTurn) => ConversationTurn,
) {
  if (turns.length === 0) {
    return turns;
  }

  const latestTurnIndex = turns.length - 1;
  return turns.map((turn, index) => (index === latestTurnIndex ? updater(turn) : turn));
}

function normalizeTurn(turn: ConversationTurn): ConversationTurn {
  return {
    ...turn,
    intermediateSegments: turn.intermediateSegments ?? [],
  };
}

function toEpochMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function pickNewerSegment(
  existingSegment: ConversationIntermediateSegment,
  nextSegment: ConversationIntermediateSegment,
) {
  const existingUpdatedAt = toEpochMs(existingSegment.updatedAt);
  const nextUpdatedAt = toEpochMs(nextSegment.updatedAt);
  if (nextUpdatedAt > existingUpdatedAt) {
    return { ...nextSegment };
  }
  if (nextUpdatedAt < existingUpdatedAt) {
    return { ...existingSegment };
  }

  if (nextSegment.text.length > existingSegment.text.length) {
    return { ...nextSegment };
  }
  if (nextSegment.text.length < existingSegment.text.length) {
    return { ...existingSegment };
  }

  return nextSegment.kind === 'message' && existingSegment.kind === 'progress'
    ? { ...nextSegment }
    : { ...existingSegment };
}

function mergeIntermediateSegments(
  existingSegments: ConversationIntermediateSegment[],
  nextSegments: ConversationIntermediateSegment[],
) {
  if (existingSegments.length === 0) {
    return cloneIntermediateSegments(nextSegments);
  }

  if (nextSegments.length === 0) {
    return cloneIntermediateSegments(existingSegments);
  }

  const mergedById = new Map<string, ConversationIntermediateSegment>();
  const orderedIds: string[] = [];

  for (const segment of existingSegments) {
    mergedById.set(segment.segmentId, { ...segment });
    orderedIds.push(segment.segmentId);
  }

  for (const segment of nextSegments) {
    const existingSegment = mergedById.get(segment.segmentId);
    if (!existingSegment) {
      mergedById.set(segment.segmentId, { ...segment });
      orderedIds.push(segment.segmentId);
      continue;
    }

    mergedById.set(segment.segmentId, pickNewerSegment(existingSegment, segment));
  }

  return orderedIds
    .map((segmentId) => mergedById.get(segmentId))
    .filter((segment): segment is ConversationIntermediateSegment => segment !== undefined);
}

function mergeTurnSnapshots(
  existingTurn: ConversationTurn | undefined,
  nextTurn: ConversationTurn,
) {
  if (!existingTurn) {
    return normalizeTurn(nextTurn);
  }

  return {
    ...existingTurn,
    ...nextTurn,
    response:
      nextTurn.response.length >= existingTurn.response.length
        ? nextTurn.response
        : existingTurn.response,
    intermediateSegments: mergeIntermediateSegments(
      existingTurn.intermediateSegments ?? [],
      nextTurn.intermediateSegments ?? [],
    ),
  };
}

function toNow() {
  return new Date().toISOString();
}

function toResultEnvelope(
  event: Extract<AgentEvent, { type: 'result.richText' | 'result.structured' }>,
) {
  return event.type === 'result.richText'
    ? {
        content: event.content,
        format: event.format,
        kind: 'richText' as const,
        source: event.source,
        structuredParseError: event.structuredParseError,
        structuredParseFailureReason: event.structuredParseFailureReason,
        structuredSchemaName: event.structuredSchemaName,
      }
    : {
        data: event.data,
        fallbackRichText: event.fallbackRichText,
        kind: 'structured' as const,
        schemaName: event.schemaName,
        source: event.source,
      };
}

export function normalizeAppSession(session: AppSession): AppSession {
  return {
    ...session,
    pendingPermissions: clonePendingPermissions(session.pendingPermissions ?? []),
    turns: session.turns.map(normalizeTurn),
  };
}

export function mergeAppSessionSnapshot(
  existingSession: AppSession | undefined,
  nextSession: AppSession,
): AppSession {
  if (!existingSession) {
    return normalizeAppSession(nextSession);
  }

  const turnsById = new Map<string, ConversationTurn>();
  existingSession.turns.forEach((turn) => {
    turnsById.set(turn.turnId, turn);
    turnsById.set(turn.messageId, turn);
  });

  return {
    ...existingSession,
    ...nextSession,
    pendingPermissions: clonePendingPermissions(nextSession.pendingPermissions ?? []),
    turns: nextSession.turns.map((turn, index) =>
      mergeTurnSnapshots(
        turnsById.get(turn.turnId) ?? turnsById.get(turn.messageId) ?? existingSession.turns[index],
        turn,
      ),
    ),
  };
}

export function isBusyAgentStatus(status: AgentStatus) {
  return status === 'starting' || status === 'running' || status === 'waiting_permission';
}

function getPendingPermissionsNewestFirst(pendingPermissions: PendingPermission[]) {
  return [...pendingPermissions].reverse();
}

export function getPendingPermissionsForTurn(session: AppSession, turnId: string) {
  return getPendingPermissionsNewestFirst(
    session.pendingPermissions.filter((permission) => permission.turnId === turnId),
  );
}

export function getSessionLevelPendingPermissions(session: AppSession) {
  return getPendingPermissionsNewestFirst(
    session.pendingPermissions.filter((permission) => permission.turnId === undefined),
  );
}

export function applyAgentEventToSession(session: AppSession, event: AgentEvent): AppSession {
  switch (event.type) {
    case 'session.capabilities':
      return {
        ...session,
        capabilities: [...event.capabilities],
        updatedAt: toNow(),
      };
    case 'status.changed': {
      const latestTurn = session.turns.at(-1);
      const nextStatus =
        session.pendingPermissions.length > 0 && event.status === 'running'
          ? 'waiting_permission'
          : event.status;
      const shouldFinalizeLatestTurn =
        (nextStatus === 'completed' || nextStatus === 'failed') && latestTurn
          ? isBusyAgentStatus(latestTurn.status)
          : false;
      const shouldSyncLatestTurnStatus =
        !shouldFinalizeLatestTurn &&
        latestTurn?.status === 'waiting_permission' &&
        nextStatus !== 'waiting_permission';
      const shouldClearPendingPermissions = nextStatus === 'completed' || nextStatus === 'failed';

      return {
        ...session,
        pendingPermissions: shouldClearPendingPermissions ? [] : session.pendingPermissions,
        status: nextStatus,
        progressHint:
          nextStatus === 'completed' || nextStatus === 'failed' ? undefined : session.progressHint,
        streamBuffer:
          nextStatus === 'completed' || nextStatus === 'failed'
            ? { content: '', messageId: null }
            : session.streamBuffer,
        turns: shouldFinalizeLatestTurn
          ? patchLatestTurn(session.turns, (turn) => ({
              ...turn,
              completedAt: toNow(),
              progressHint: undefined,
              status: nextStatus,
            }))
          : shouldSyncLatestTurnStatus
            ? patchLatestTurn(session.turns, (turn) => ({
                ...turn,
                progressHint: undefined,
                status: nextStatus,
              }))
            : session.turns,
        updatedAt: toNow(),
      };
    }
    case 'progress.updated': {
      const nextStatus = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
      return {
        ...session,
        progressHint: { ...event.progressHint },
        status: nextStatus,
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? {
                ...applyProgressHintToTurn(turn, event.progressHint, event.progressHint.updatedAt),
                status: nextStatus,
              }
            : turn,
        ),
        updatedAt: toNow(),
      };
    }
    case 'message.delta': {
      const nextStatus = session.pendingPermissions.length > 0 ? 'waiting_permission' : 'running';
      return {
        ...session,
        progressHint: undefined,
        status: nextStatus,
        streamBuffer: {
          content: session.streamBuffer.content + event.text,
          messageId: event.messageId,
        },
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? {
                ...applyMessageDeltaToTurn(turn, session.agent, event.text, event.updatedAt),
                status: nextStatus,
              }
            : turn,
        ),
        updatedAt: toNow(),
      };
    }
    case 'message.completed':
      return {
        ...session,
        turns: patchLatestTurn(session.turns, (turn) =>
          turn.messageId === event.messageId
            ? { ...turn, completedAt: toNow(), status: 'completed' }
            : turn,
        ),
        updatedAt: toNow(),
      };
    case 'result.richText':
    case 'result.structured': {
      const result = toResultEnvelope(event);
      return {
        ...session,
        finalResult: result,
        lastError: undefined,
        pendingPermissions: [],
        progressHint: undefined,
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          progressHint: undefined,
          result,
        })),
        updatedAt: toNow(),
      };
    }
    case 'permission.requested':
      return {
        ...session,
        pendingPermissions: [
          ...session.pendingPermissions.filter(
            (permission) => permission.requestId !== event.permission.requestId,
          ),
          clonePendingPermission(event.permission),
        ],
        progressHint: undefined,
        status: 'waiting_permission',
        turns: session.turns.map((turn) =>
          turn.turnId === event.permission.turnId ||
          (!event.permission.turnId && turn === session.turns.at(-1))
            ? {
                ...turn,
                progressHint: undefined,
                status: 'waiting_permission',
              }
            : turn,
        ),
        updatedAt: toNow(),
      };
    case 'permission.resolved': {
      const resolvedPermission = session.pendingPermissions.find(
        (permission) => permission.requestId === event.requestId,
      );
      const nextPendingPermissions = session.pendingPermissions.filter(
        (permission) => permission.requestId !== event.requestId,
      );
      const turnId = resolvedPermission?.turnId;
      const stillPendingForTurn = turnId
        ? nextPendingPermissions.some((permission) => permission.turnId === turnId)
        : false;

      return {
        ...session,
        pendingPermissions: nextPendingPermissions,
        progressHint: undefined,
        status: nextPendingPermissions.length > 0 ? 'waiting_permission' : 'running',
        turns: session.turns.map((turn) =>
          turn.turnId === turnId || (!turnId && turn === session.turns.at(-1))
            ? {
                ...turn,
                progressHint: undefined,
                status:
                  nextPendingPermissions.length > 0 || stillPendingForTurn
                    ? 'waiting_permission'
                    : 'running',
              }
            : turn,
        ),
        updatedAt: toNow(),
      };
    }
    case 'error':
      return {
        ...session,
        lastError: { ...event.error },
        pendingPermissions: [],
        progressHint: undefined,
        status: 'failed',
        streamBuffer: { content: '', messageId: null },
        turns: patchLatestTurn(session.turns, (turn) => ({
          ...turn,
          completedAt: toNow(),
          progressHint: undefined,
          status: 'failed',
        })),
        updatedAt: toNow(),
      };
    case 'session.started':
    default:
      return session;
  }
}
