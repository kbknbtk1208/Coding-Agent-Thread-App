import React, { useEffect, useRef, useState } from 'react';
import type {
  ReviewFindingCategory,
  ReviewFindingConfidence,
  ReviewFindingSeverity,
} from '../../../shared/domain/review-draft';
import type { ReviewMentionThread } from '../../../shared/domain/review-mention';
import { MentionThreadHistory } from './mention-thread-history';
import { reviewTheme } from './review-ui';
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
    <div className="space-y-3 rounded-[12px] border border-white/10 bg-black/30 p-4">
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
          renderStreamingRichText(latestTurn.response, 'text-sm leading-7 text-[#d0d5db]')
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
      className={`rounded-[12px] border p-4 transition ${
        isSelected
          ? 'border-[#4EBE96]/30 bg-[#4EBE96]/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelectThread(thread.mentionThreadId)}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={reviewTheme.chipSuccess}>Mention</span>
          <span className={reviewTheme.chip}>{thread.reviewAgent}</span>
          {thread.replyStatus !== 'idle' ? (
            <span className={reviewTheme.chipInfo}>{thread.replyStatus}</span>
          ) : null}
        </div>
        <p className="mt-3 text-sm font-semibold text-[#f8f7f4]">{thread.messages[0]?.body}</p>
        <p className="mt-2 text-xs text-[#8b949e]">{formatSelection(thread)}</p>
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
              className={reviewTheme.textarea}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPromoteOpen((prev) => !prev)}
                disabled={thread.promotedDraftThreadId !== null}
                className={reviewTheme.secondaryButton}
              >
                指摘草案へ昇格
              </button>
              <button
                type="button"
                disabled={!replyBody.trim() || thread.replyStatus === 'replying'}
                onClick={() => onSubmitReply(thread.mentionThreadId, replyBody)}
                className="rounded-[10px] border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-3 py-1.5 text-xs font-medium text-[#d7f5e8] hover:bg-[#4EBE96]/15 disabled:opacity-40"
              >
                Ask Follow-up
              </button>
            </div>
          </div>

          {isPromoteOpen ? (
            <div className="space-y-3 rounded-[12px] border border-white/10 bg-black/30 p-4">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={reviewTheme.field}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                className={reviewTheme.textarea}
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as ReviewFindingSeverity)}
                  className={reviewTheme.fieldCompact}
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ReviewFindingCategory)}
                  className={reviewTheme.fieldCompact}
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
                  className={reviewTheme.fieldCompact}
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
                  className={reviewTheme.secondaryButton}
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
                  className="rounded-[10px] border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-3 py-1.5 text-xs font-medium text-[#d7f5e8] hover:bg-[#4EBE96]/15 disabled:opacity-40"
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
