import React, { useEffect, useRef } from 'react';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import { DraftThreadHistory } from './draft-thread-history';
import { DraftThreadComposer } from './draft-thread-composer';
import { InlineThreadSessionStream } from './inline-thread-session-stream';

function getSeverityBadgeClass(severity: ReviewLocalThread['draft']['severity']): string {
  switch (severity) {
    case 'high':
      return 'bg-red-500/15 text-red-200';
    case 'medium':
      return 'bg-amber-500/15 text-amber-200';
    case 'low':
      return 'bg-emerald-500/15 text-emerald-200';
  }
}

function getDebugDowngradeReasonLabel(
  reason: NonNullable<ReviewLocalThread['draft']['debugDowngrade']>['reason'],
): string {
  switch (reason) {
    case 'fileNotFound':
      return 'snapshot 内で対象 filePath を解決できませんでした。';
    case 'ineligibleSide':
      return 'changeType と requested side の組み合わせが不正でした。';
    case 'binaryFile':
      return 'binary file は diff inline 表示の対象外でした。';
    case 'largeDiff':
      return 'large diff は diff inline 表示の対象外でした。';
    case 'lineOutOfRange':
      return 'requested line 範囲が対象 content の行数を超えていました。';
    case 'excerptNotFound':
      return 'requested excerpt が対象 side の本文に一致しませんでした。';
  }
}

function formatDebugRequestedLocation(
  debugDowngrade: NonNullable<ReviewLocalThread['draft']['debugDowngrade']>,
): string {
  if (debugDowngrade.requestedStartLine === null && debugDowngrade.requestedEndLine === null) {
    return `${debugDowngrade.requestedFilePath} [${debugDowngrade.requestedSide}] File`;
  }

  if (
    debugDowngrade.requestedStartLine !== null &&
    debugDowngrade.requestedEndLine !== null &&
    debugDowngrade.requestedStartLine !== debugDowngrade.requestedEndLine
  ) {
    return `${debugDowngrade.requestedFilePath} [${debugDowngrade.requestedSide}] L${debugDowngrade.requestedStartLine}-L${debugDowngrade.requestedEndLine}`;
  }

  return `${debugDowngrade.requestedFilePath} [${debugDowngrade.requestedSide}] L${debugDowngrade.requestedEndLine ?? debugDowngrade.requestedStartLine ?? '?'}`;
}

function formatResolvedLocation(thread: ReviewLocalThread): string {
  const resolvedLocation =
    thread.draft.resolvedLocation.kind === 'diff' ? thread.draft.resolvedLocation : null;
  return resolvedLocation
    ? `${resolvedLocation.filePath}:L${resolvedLocation.endLine ?? resolvedLocation.startLine ?? '?'}`
    : 'Overview finding';
}

export interface DraftThreadCardProps {
  thread: ReviewLocalThread;
  isSelected: boolean;
  replyBody: string;
  onSelectThread: (localThreadId: string) => void;
  onReplyBodyChange: (localThreadId: string, body: string) => void;
  onSubmitReply: (localThreadId: string, body: string) => void;
  onRespondToPermission: (localThreadId: string, requestId: string, actionId: string) => void;
}

export function DraftThreadCard({
  thread,
  isSelected,
  replyBody,
  onSelectThread,
  onReplyBodyChange,
  onSubmitReply,
  onRespondToPermission,
}: DraftThreadCardProps) {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isSelected) {
      return;
    }

    containerRef.current?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }, [isSelected]);

  return (
    <article
      ref={containerRef}
      className={`rounded-2xl border p-4 transition ${
        isSelected
          ? 'border-fuchsia-300/30 bg-fuchsia-500/10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelectThread(thread.localThreadId)}
        className="w-full text-left"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
            Draft
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${getSeverityBadgeClass(thread.draft.severity)}`}
          >
            {thread.draft.severity}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
            {thread.draft.category}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
            {thread.draft.confidence}
          </span>
          {thread.replyStatus === 'replying' ? (
            <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-200">
              replying
            </span>
          ) : null}
          {thread.replyStatus === 'failed' ? (
            <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-rose-200">
              failed
            </span>
          ) : null}
        </div>

        <div className="mt-3">
          <h3 className="text-sm font-semibold text-white">{thread.draft.title}</h3>
          {isSelected ? (
            <p className="mt-2 text-xs text-slate-500">{formatResolvedLocation(thread)}</p>
          ) : (
            <>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                {thread.draft.draftBody}
              </p>
              <p className="mt-3 text-xs text-slate-500">{formatResolvedLocation(thread)}</p>
            </>
          )}
        </div>
      </button>

      {isSelected ? (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {thread.draft.resolvedLocation.kind === 'overview' && thread.draft.debugDowngrade ? (
            <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-left text-xs text-amber-100">
              <p className="font-semibold uppercase tracking-[0.18em] text-amber-200">
                Debug: diff to overview fallback
              </p>
              <p className="mt-2">
                {getDebugDowngradeReasonLabel(thread.draft.debugDowngrade.reason)}
              </p>
              <p className="mt-2 font-mono text-[11px] text-amber-200/90">
                requested diff: {formatDebugRequestedLocation(thread.draft.debugDowngrade)}
              </p>
            </div>
          ) : null}

          <DraftThreadHistory thread={thread} />

          <InlineThreadSessionStream
            thread={thread}
            onRespondToPermission={onRespondToPermission}
          />

          <DraftThreadComposer
            thread={thread}
            replyBody={replyBody}
            onReplyBodyChange={onReplyBodyChange}
            onSubmitReply={onSubmitReply}
          />
        </div>
      ) : null}
    </article>
  );
}
