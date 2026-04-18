import React from 'react';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_STYLES,
  SessionIntermediateSegments,
  SessionPermissionCard,
  renderStreamingRichText,
  renderWaitingResponse,
} from '../../components/session-event-panel';
import {
  getPendingPermissionsForTurn,
  getSessionLevelPendingPermissions,
  isBusyAgentStatus,
} from '../../components/session-event-state';

function hasSavedAgentReply(thread: ReviewLocalThread): boolean {
  return thread.messages.at(-1)?.source === 'agent-reply';
}

function renderThreadResponse(response: string, responseMode: 'richText' | 'structured') {
  if (responseMode === 'richText') {
    return renderStreamingRichText(response, 'text-sm leading-7 text-[#d0d5db]');
  }

  return <pre className="whitespace-pre-wrap text-sm leading-7 text-[#d0d5db]">{response}</pre>;
}

export interface InlineThreadSessionStreamProps {
  thread: ReviewLocalThread;
  onRespondToPermission: (localThreadId: string, requestId: string, actionId: string) => void;
}

export function InlineThreadSessionStream({
  thread,
  onRespondToPermission,
}: InlineThreadSessionStreamProps) {
  const session = thread.activeReplySession;

  if (!session) {
    return thread.lastError ? (
      <div className="rounded-[12px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-4 py-3 text-sm text-[#ffd9d9]">
        {thread.lastError}
      </div>
    ) : null;
  }

  const latestTurn = session.turns.at(-1) ?? null;
  const sessionLevelPendingPermissions = getSessionLevelPendingPermissions(session);
  const turnPendingPermissions = latestTurn
    ? getPendingPermissionsForTurn(session, latestTurn.turnId)
    : [];
  const shouldShowTransientStream =
    thread.replyStatus === 'replying' && !hasSavedAgentReply(thread);
  const isActiveTurn = latestTurn
    ? !latestTurn.result && isBusyAgentStatus(latestTurn.status)
    : false;
  const hasVisibleIntermediateContent =
    shouldShowTransientStream && latestTurn
      ? latestTurn.intermediateSegments.some((segment) => segment.kind === 'message') ||
        isActiveTurn
      : false;
  const waitingText = shouldShowTransientStream
    ? latestTurn
      ? isActiveTurn
        ? (latestTurn.progressHint?.text ?? session.progressHint?.text ?? 'running')
        : undefined
      : (session.progressHint?.text ?? '応答を待っています...')
    : undefined;
  const shouldRenderPanel =
    shouldShowTransientStream ||
    thread.lastError !== null ||
    sessionLevelPendingPermissions.length > 0 ||
    turnPendingPermissions.length > 0;

  if (!shouldRenderPanel) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${SESSION_STATUS_STYLES[session.status]}`}
        >
          {SESSION_STATUS_LABELS[session.status]}
        </span>
        <span className="text-xs text-[#8b949e]">session: {session.appSessionId}</span>
      </div>

      {thread.lastError ? (
        <div className="rounded-[12px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-3 text-sm text-[#ffd9d9]">
          {thread.lastError}
        </div>
      ) : null}

      {sessionLevelPendingPermissions.length > 0 ? (
        <div className="space-y-3">
          {sessionLevelPendingPermissions.map((permission) => (
            <SessionPermissionCard
              key={permission.requestId}
              title="Thread permission"
              description="このスレッド返信に必要な permission request です。"
              permission={permission}
              onRespond={(requestId, actionId) => {
                onRespondToPermission(thread.localThreadId, requestId, actionId);
              }}
            />
          ))}
        </div>
      ) : null}

      {turnPendingPermissions.length > 0 ? (
        <div className="space-y-3">
          {turnPendingPermissions.map((permission) => (
            <SessionPermissionCard
              key={permission.requestId}
              title="Thread permission"
              description="このスレッド返信に必要な permission request です。"
              permission={permission}
              onRespond={(requestId, actionId) => {
                onRespondToPermission(thread.localThreadId, requestId, actionId);
              }}
            />
          ))}
        </div>
      ) : null}

      {shouldShowTransientStream ? (
        latestTurn ? (
          hasVisibleIntermediateContent ? (
            <SessionIntermediateSegments
              segments={latestTurn.intermediateSegments}
              isLatestTurn
              turn={latestTurn}
            />
          ) : latestTurn.response ? (
            renderThreadResponse(latestTurn.response, latestTurn.responseMode)
          ) : waitingText ? (
            renderWaitingResponse(waitingText)
          ) : null
        ) : waitingText ? (
          renderWaitingResponse(waitingText)
        ) : null
      ) : null}
    </div>
  );
}
