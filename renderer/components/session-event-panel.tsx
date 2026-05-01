import React from 'react';
import type {
  AgentStatus,
  AppSession,
  ConversationIntermediateSegment,
  ConversationTurn,
  PendingPermission,
  PermissionAction,
} from '../../shared/domain/agent';
import {
  getPendingPermissionsForTurn,
  getSessionLevelPendingPermissions,
  isBusyAgentStatus,
} from './session-event-state';
import { cn } from '../lib/cn';
import { ChainOfThought } from './ui/chain-of-thought';
import { Reasoning } from './ui/reasoning';
import { ShimmerText } from './ui/shimmer-text';
import { TextEffect } from './ui/text-effect';

export const SESSION_STATUS_LABELS: Record<AgentStatus, string> = {
  completed: 'Completed / 次入力待ち',
  failed: 'Failed',
  idle: 'Idle',
  running: 'Running',
  starting: 'Starting',
  waiting_permission: 'Waiting Permission',
};

export const SESSION_STATUS_STYLES: Record<AgentStatus, string> = {
  completed: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-50',
  failed: 'border-rose-300/30 bg-rose-300/10 text-rose-50',
  idle: 'border-slate-200/15 bg-white/6 text-slate-100',
  running: 'border-amber-200/25 bg-amber-300/12 text-amber-50',
  starting: 'border-cyan-200/25 bg-cyan-300/12 text-cyan-50',
  waiting_permission: 'border-fuchsia-200/25 bg-fuchsia-300/12 text-fuchsia-50',
};

const PERMISSION_ACTION_STYLES: Record<
  PermissionAction['kind'],
  { border: string; text: string; hover: string }
> = {
  approve: {
    border: 'border-emerald-200/30',
    text: 'text-emerald-50',
    hover: 'hover:border-emerald-100/40 hover:bg-emerald-300/18',
  },
  cancel: {
    border: 'border-slate-200/20',
    text: 'text-slate-100',
    hover: 'hover:border-white/20 hover:bg-white/10',
  },
  other: {
    border: 'border-fuchsia-200/25',
    text: 'text-fuchsia-50',
    hover: 'hover:border-fuchsia-100/40 hover:bg-fuchsia-300/18',
  },
  reject: {
    border: 'border-rose-200/30',
    text: 'text-rose-50',
    hover: 'hover:border-rose-100/40 hover:bg-rose-300/18',
  },
};

export function renderStreamingRichText(text: string, className: string) {
  return (
    <TextEffect
      as="p"
      text={text}
      layout="flow"
      preserveWhitespace
      staggerWindow={32}
      segmentDelay={0.018}
      className={className}
    />
  );
}

export function renderWaitingResponse(
  text = '応答を待っています...',
  className = 'text-sm leading-7',
  shimmerClassName = 'block font-medium',
) {
  return (
    <p className={className}>
      <ShimmerText text={text} className={shimmerClassName} />
    </p>
  );
}

function serializePermissionPayload(payload: unknown) {
  if (payload === undefined) {
    return 'undefined';
  }

  return JSON.stringify(payload, null, 2) ?? 'null';
}

export function SessionPermissionCard(props: {
  description: string;
  isSubmitting?: boolean;
  onRespond?: (requestId: string, actionId: string) => void;
  permission: PendingPermission;
  title: string;
}) {
  const { permission } = props;
  const isInteractive = props.onRespond !== undefined;

  return (
    <div className="space-y-4 rounded-[1.4rem] border border-fuchsia-200/25 bg-fuchsia-300/12 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-fuchsia-100/80">
            {props.title}
          </p>
          <p className="text-sm text-fuchsia-50/90">{props.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-fuchsia-100/20 bg-fuchsia-200/10 px-3 py-1 text-[11px] font-medium text-fuchsia-50">
            requestId: {permission.requestId}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-200">
            {permission.method}
          </span>
        </div>
      </div>

      <div className="grid gap-2 text-xs text-fuchsia-50/75 sm:grid-cols-2">
        {permission.turnId ? (
          <p className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2">
            turnId: {permission.turnId}
          </p>
        ) : null}
        {permission.itemId ? (
          <p className="rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2">
            itemId: {permission.itemId}
          </p>
        ) : null}
      </div>

      <pre className="overflow-x-auto whitespace-pre-wrap rounded-[1.2rem] border border-white/10 bg-black/40 p-4 text-sm leading-7 text-slate-100">
        {serializePermissionPayload(permission.payload)}
      </pre>

      {isInteractive ? (
        <div className="flex flex-wrap gap-3">
          {permission.actions.map((action) => {
            const actionStyle =
              PERMISSION_ACTION_STYLES[action.kind] ?? PERMISSION_ACTION_STYLES.other;
            return (
              <button
                key={action.actionId}
                type="button"
                onClick={() => {
                  props.onRespond?.(permission.requestId, action.actionId);
                }}
                disabled={props.isSubmitting}
                className={`rounded-full border px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/5 disabled:text-slate-500 ${actionStyle.border} ${actionStyle.text} ${actionStyle.hover}`}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {permission.actions.map((action) => {
            const actionStyle =
              PERMISSION_ACTION_STYLES[action.kind] ?? PERMISSION_ACTION_STYLES.other;
            return (
              <span
                key={action.actionId}
                className={`rounded-full border px-3 py-1 text-[11px] font-medium ${actionStyle.border} ${actionStyle.text}`}
              >
                {action.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SessionIntermediateSegments(props: {
  activeSegmentClassName?: string;
  chainClassName?: string;
  chainContentClassName?: string;
  className?: string;
  inactiveSegmentClassName?: string;
  isLatestTurn: boolean;
  reasoningClassName?: string;
  reasoningContentClassName?: string;
  segments: ConversationIntermediateSegment[];
  turn: ConversationTurn;
  waitingClassName?: string;
  waitingShimmerClassName?: string;
}) {
  const isActiveTurn =
    props.isLatestTurn &&
    !props.turn.result &&
    (props.turn.status === 'starting' || props.turn.status === 'running');

  const latestSegment = props.segments.at(-1);
  const messageSegments = props.segments.filter((segment) => segment.kind === 'message');
  const hintText: string | null = isActiveTurn
    ? latestSegment !== undefined && latestSegment.kind === 'progress'
      ? latestSegment.text
      : 'running'
    : null;
  const activeMessageSegmentId: string | null =
    isActiveTurn && latestSegment !== undefined && latestSegment.kind === 'message'
      ? latestSegment.segmentId
      : null;

  return (
    <div className={cn('space-y-3', props.className)}>
      {messageSegments.length > 0 ? (
        <ChainOfThought
          className={props.chainClassName}
          contentClassName={props.chainContentClassName}
        >
          {messageSegments.map((segment) => {
            const isActiveSegment = segment.segmentId === activeMessageSegmentId;
            return (
              <Reasoning
                key={segment.segmentId}
                className={props.reasoningClassName}
                contentClassName={props.reasoningContentClassName}
                isActive={isActiveSegment}
              >
                {isActiveSegment ? (
                  renderStreamingRichText(
                    segment.text,
                    cn('whitespace-pre-wrap text-sm leading-7', props.activeSegmentClassName),
                  )
                ) : (
                  <span className={cn('whitespace-pre-wrap', props.inactiveSegmentClassName)}>
                    {segment.text}
                  </span>
                )}
              </Reasoning>
            );
          })}
        </ChainOfThought>
      ) : null}
      {hintText !== null
        ? renderWaitingResponse(hintText, props.waitingClassName, props.waitingShimmerClassName)
        : null}
    </div>
  );
}

interface SessionEventPanelProps {
  emptyMessage?: string;
  pendingSessionId?: string | null;
  session: AppSession | null;
}

export function SessionEventPanel({
  emptyMessage = 'review 実行を開始すると進捗イベントをここへ表示します。',
  pendingSessionId = null,
  session,
}: SessionEventPanelProps) {
  if (!session) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
        {pendingSessionId ? (
          <div className="space-y-2">
            <p className="text-slate-300">session を取得しています。</p>
            <p className="font-mono text-xs text-slate-500">{pendingSessionId}</p>
          </div>
        ) : (
          emptyMessage
        )}
      </div>
    );
  }

  const latestTurn = session.turns.at(-1) ?? null;
  const sessionLevelPendingPermissions = getSessionLevelPendingPermissions(session);
  const turnPendingPermissions = latestTurn
    ? getPendingPermissionsForTurn(session, latestTurn.turnId)
    : [];
  const isActiveTurn = latestTurn
    ? !latestTurn.result && isBusyAgentStatus(latestTurn.status)
    : false;
  const hasVisibleIntermediateContent = latestTurn
    ? latestTurn.intermediateSegments.some((segment) => segment.kind === 'message') || isActiveTurn
    : false;
  const waitingText = latestTurn
    ? isActiveTurn
      ? (latestTurn.progressHint?.text ?? session.progressHint?.text ?? 'running')
      : undefined
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Review Event Stream</h3>
          <p className="mt-1 text-xs text-slate-500">
            status / progress / message / permission / error を read-only で表示します。
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${SESSION_STATUS_STYLES[session.status]}`}
        >
          {SESSION_STATUS_LABELS[session.status]}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Session</div>
        <div className="mt-2 font-mono text-[11px] text-slate-300">{session.appSessionId}</div>
      </div>

      {session.lastError ? (
        <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
          {session.lastError.message}
        </div>
      ) : null}

      {sessionLevelPendingPermissions.length > 0 ? (
        <div className="space-y-3">
          {sessionLevelPendingPermissions.map((permission) => (
            <SessionPermissionCard
              key={permission.requestId}
              permission={permission}
              title="Session-level permission"
              description="session 全体に対する権限要求です。"
            />
          ))}
        </div>
      ) : null}

      {turnPendingPermissions.length > 0 ? (
        <div className="space-y-3">
          {turnPendingPermissions.map((permission) => (
            <SessionPermissionCard
              key={permission.requestId}
              permission={permission}
              title="Turn-level permission"
              description="この review turn に紐づく権限要求です。"
            />
          ))}
        </div>
      ) : null}

      {latestTurn ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Latest turn</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
                {latestTurn.prompt}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-medium ${SESSION_STATUS_STYLES[latestTurn.status]}`}
            >
              {SESSION_STATUS_LABELS[latestTurn.status]}
            </span>
          </div>

          {hasVisibleIntermediateContent ? (
            <SessionIntermediateSegments
              segments={latestTurn.intermediateSegments}
              isLatestTurn
              turn={latestTurn}
            />
          ) : latestTurn.response ? (
            latestTurn.responseMode === 'richText' ? (
              renderStreamingRichText(latestTurn.response, 'text-sm leading-7 text-slate-200')
            ) : (
              <pre className="whitespace-pre-wrap text-sm leading-7 text-slate-200">
                {latestTurn.response}
              </pre>
            )
          ) : waitingText ? (
            renderWaitingResponse(waitingText)
          ) : (
            <p className="text-sm text-slate-500">
              {session.status === 'completed'
                ? 'review 実行が完了しました。summary と drafts を確認できます。'
                : 'まだ表示できるイベントがありません。'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
