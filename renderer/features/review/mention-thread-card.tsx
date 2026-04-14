import React, { useEffect, useRef, useState } from 'react';
import type {
  ReviewFindingCategory,
  ReviewFindingConfidence,
  ReviewFindingSeverity,
} from '../../../shared/domain/review-draft';
import type { ReviewMentionThread } from '../../../shared/domain/review-mention';
import { MentionThreadHistory } from './mention-thread-history';
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

interface PromoteDraftValues {
  title: string;
  body: string;
  severity: ReviewFindingSeverity;
  category: ReviewFindingCategory;
  confidence: ReviewFindingConfidence;
  suggestion?: string;
}

interface MentionThreadCardProps {
  thread: ReviewMentionThread;
  isSelected: boolean;
  replyBody: string;
  onSelectThread: (mentionThreadId: string) => void;
  onReplyBodyChange: (mentionThreadId: string, body: string) => void;
  onSubmitReply: (mentionThreadId: string, body: string) => void;
  onPromote: (mentionThreadId: string, values: PromoteDraftValues) => void;
  onRespondToPermission: (mentionThreadId: string, requestId: string, actionId: string) => void;
}

function formatSelection(thread: ReviewMentionThread): string {
  const { selection } = thread;
  const lineLabel =
    selection.startLine === selection.endLine
      ? `L${selection.endLine}`
      : `L${selection.startLine}-L${selection.endLine}`;
  return `${selection.filePath} [${selection.side}] ${lineLabel}`;
}

function getLatestAssistantBody(thread: ReviewMentionThread): string {
  return (
    [...thread.messages].reverse().find((message) => message.role === 'assistant')?.body ??
    thread.messages[0]?.body ??
    ''
  );
}

function MentionSessionStream({
  thread,
  onRespondToPermission,
}: {
  thread: ReviewMentionThread;
  onRespondToPermission: (mentionThreadId: string, requestId: string, actionId: string) => void;
}) {
  const session = thread.activeSession;
  if (!session) {
    return thread.lastError ? (
      <div className="rounded border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
        {thread.lastError}
      </div>
    ) : null;
  }

  const latestTurn = session.turns.at(-1) ?? null;
  const sessionLevelPendingPermissions = getSessionLevelPendingPermissions(session);
  const turnPendingPermissions = latestTurn
    ? getPendingPermissionsForTurn(session, latestTurn.turnId)
    : [];
  const shouldShowTransientStream = thread.replyStatus === 'replying';
  const isActiveTurn = latestTurn
    ? !latestTurn.result && isBusyAgentStatus(latestTurn.status)
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
    <div className="space-y-3 rounded border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-medium ${SESSION_STATUS_STYLES[session.status]}`}
        >
          {SESSION_STATUS_LABELS[session.status]}
        </span>
        <span className="text-xs text-slate-500">session: {session.appSessionId}</span>
      </div>

      {thread.lastError ? (
        <div className="rounded border border-rose-400/20 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">
          {thread.lastError}
        </div>
      ) : null}

      {[...sessionLevelPendingPermissions, ...turnPendingPermissions].map((permission) => (
        <SessionPermissionCard
          key={permission.requestId}
          title="Mention permission"
          description="この選択範囲相談に必要な permission request です。"
          permission={permission}
          onRespond={(requestId, actionId) => {
            onRespondToPermission(thread.mentionThreadId, requestId, actionId);
          }}
        />
      ))}

      {shouldShowTransientStream && latestTurn ? (
        latestTurn.intermediateSegments.some((segment) => segment.kind === 'message') ||
        isActiveTurn ? (
          <SessionIntermediateSegments
            segments={latestTurn.intermediateSegments}
            isLatestTurn
            turn={latestTurn}
          />
        ) : latestTurn.response ? (
          renderStreamingRichText(latestTurn.response, 'text-sm leading-7 text-slate-200')
        ) : waitingText ? (
          renderWaitingResponse(waitingText)
        ) : null
      ) : waitingText ? (
        renderWaitingResponse(waitingText)
      ) : null}
    </div>
  );
}

export function MentionThreadCard({
  thread,
  isSelected,
  replyBody,
  onSelectThread,
  onReplyBodyChange,
  onSubmitReply,
  onPromote,
  onRespondToPermission,
}: MentionThreadCardProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [isPromoteOpen, setIsPromoteOpen] = useState(false);
  const [title, setTitle] = useState(thread.messages[0]?.body.slice(0, 80) ?? 'Selection mention');
  const [body, setBody] = useState(getLatestAssistantBody(thread));
  const [severity, setSeverity] = useState<ReviewFindingSeverity>('medium');
  const [category, setCategory] = useState<ReviewFindingCategory>('correctness');
  const [confidence, setConfidence] = useState<ReviewFindingConfidence>('medium');

  useEffect(() => {
    if (!isSelected) {
      return;
    }
    containerRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [isSelected]);

  useEffect(() => {
    if (!isPromoteOpen) {
      setBody(getLatestAssistantBody(thread));
    }
  }, [isPromoteOpen, thread]);

  return (
    <article
      ref={containerRef}
      className={`rounded border p-4 transition ${
        isSelected
          ? 'border-emerald-300/30 bg-emerald-400/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelectThread(thread.mentionThreadId)}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Mention
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            {thread.reviewAgent}
          </span>
          {thread.replyStatus !== 'idle' ? (
            <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
              {thread.replyStatus}
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-sm font-semibold text-white">{thread.messages[0]?.body}</p>
        <p className="mt-2 text-xs text-slate-500">{formatSelection(thread)}</p>
      </button>

      {isSelected ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          <MentionThreadHistory thread={thread} />
          <MentionSessionStream thread={thread} onRespondToPermission={onRespondToPermission} />

          <div className="space-y-2">
            <textarea
              value={replyBody}
              onChange={(e) => onReplyBodyChange(thread.mentionThreadId, e.target.value)}
              rows={3}
              placeholder="追加で質問..."
              className="w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-300/50 focus:outline-none"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPromoteOpen((prev) => !prev)}
                disabled={thread.promotedDraftThreadId !== null}
                className="rounded border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-40"
              >
                指摘草案へ昇格
              </button>
              <button
                type="button"
                disabled={!replyBody.trim() || thread.replyStatus === 'replying'}
                onClick={() => onSubmitReply(thread.mentionThreadId, replyBody)}
                className="rounded bg-emerald-400/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/30 disabled:opacity-40"
              >
                Ask Follow-up
              </button>
            </div>
          </div>

          {isPromoteOpen ? (
            <div className="space-y-3 rounded border border-white/10 bg-black/20 p-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-300/50 focus:outline-none"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className="w-full resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-emerald-300/50 focus:outline-none"
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as ReviewFindingSeverity)}
                  className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ReviewFindingCategory)}
                  className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="correctness">correctness</option>
                  <option value="tests">tests</option>
                  <option value="maintainability">maintainability</option>
                  <option value="performance">performance</option>
                  <option value="security">security</option>
                  <option value="design">design</option>
                  <option value="docs">docs</option>
                </select>
                <select
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value as ReviewFindingConfidence)}
                  className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPromoteOpen(false)}
                  className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!title.trim() || !body.trim()}
                  onClick={() => {
                    onPromote(thread.mentionThreadId, {
                      title,
                      body,
                      severity,
                      category,
                      confidence,
                    });
                    setIsPromoteOpen(false);
                  }}
                  className="rounded bg-emerald-400/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/30 disabled:opacity-40"
                >
                  Draft に追加
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
