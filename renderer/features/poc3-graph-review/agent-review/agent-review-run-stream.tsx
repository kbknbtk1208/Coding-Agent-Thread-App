'use client';

import { Clock3, ShieldQuestion } from 'lucide-react';
import type {
  AppSession,
  ConversationTurn,
  PendingPermission,
} from '../../../../shared/domain/agent';
import { isAgentReviewRunActive } from './agent-review-state';
import type { AgentReviewRun } from './agent-review-types';

export interface AgentReviewRunStreamProps {
  run: AgentReviewRun;
  session: AppSession;
  submittingPermissionKey: string | null;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
}

export function AgentReviewRunStream({
  run,
  session,
  submittingPermissionKey,
  onRespondPermission,
}: AgentReviewRunStreamProps) {
  const isActive = isAgentReviewRunActive(run.status);
  const { pendingPermissions, turns } = session;

  return (
    <div className="flex flex-col gap-2">
      {pendingPermissions.map((permission) => (
        <AgentReviewPermissionActionRow
          key={permission.requestId}
          appSessionId={session.appSessionId}
          permission={permission}
          submittingPermissionKey={submittingPermissionKey}
          onRespondPermission={onRespondPermission}
        />
      ))}
      {turns.map((turn, index) => (
        <AgentReviewTurnEvent
          key={turn.turnId}
          turn={turn}
          isStreaming={isActive && index === turns.length - 1}
        />
      ))}
      {session.streamBuffer.content ? (
        <div className="px-2 py-1.5">
          <p
            className={`whitespace-pre-wrap text-[11px] leading-5 ${isActive ? 'text-shimmer' : 'text-white/52'}`}
          >
            {session.streamBuffer.content}
          </p>
        </div>
      ) : null}
    </div>
  );
}

interface AgentReviewPermissionActionRowProps {
  appSessionId: string;
  permission: PendingPermission;
  submittingPermissionKey: string | null;
  onRespondPermission(appSessionId: string, requestId: string, actionId: string): Promise<void>;
}

export function AgentReviewPermissionActionRow({
  appSessionId,
  permission,
  submittingPermissionKey,
  onRespondPermission,
}: AgentReviewPermissionActionRowProps) {
  return (
    <div className="rounded-[7px] border border-[#ffbf6b]/24 bg-[#ffbf6b]/10 px-2.5 py-2">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-[#ffe0b5]">
        <ShieldQuestion className="size-3.5" aria-hidden="true" />
        {permission.method}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {permission.actions.map((action) => {
          const key = `${appSessionId}:${permission.requestId}:${action.actionId}`;
          const busy = submittingPermissionKey === key;
          return (
            <button
              key={action.actionId}
              type="button"
              disabled={busy}
              className="rounded-[5px] border border-[#ffbf6b]/25 px-2 py-1 text-[10px] font-semibold text-[#ffe0b5] transition hover:bg-[#ffbf6b]/12 disabled:opacity-50"
              onClick={() =>
                void onRespondPermission(appSessionId, permission.requestId, action.actionId)
              }
            >
              {busy ? '...' : action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AgentReviewTurnEventProps {
  turn: ConversationTurn;
  isStreaming: boolean;
}

export function AgentReviewTurnEvent({ turn, isStreaming }: AgentReviewTurnEventProps) {
  const latestSegment = turn.intermediateSegments.at(-1);
  const body = latestSegment?.text || turn.response || turn.progressHint?.text || turn.prompt;
  return (
    <div className="px-2 py-1.5">
      <div className="mb-1 flex items-center justify-end gap-2 text-[10px] text-white/32">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3" aria-hidden="true" />
          {formatTime(turn.startedAt)}
        </span>
      </div>
      <p
        className={`line-clamp-4 whitespace-pre-wrap text-[11px] leading-5 ${isStreaming ? 'text-shimmer' : 'text-white/52'}`}
      >
        {body}
      </p>
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
