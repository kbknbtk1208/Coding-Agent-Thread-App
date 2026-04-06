import React, { useMemo, useState } from 'react';
import type { ReviewLocalThread } from '../../../shared/domain/review-draft';
import {
  SESSION_STATUS_LABELS,
  SESSION_STATUS_STYLES,
  SessionPermissionCard,
} from '../../components/session-event-panel';

interface LocalThreadPanelProps {
  threads: ReviewLocalThread[];
  selectedFileId: string | null;
  selectedLocalThreadId: string | null;
  onSelectFile: (fileId: string) => void;
  onSelectThread: (localThreadId: string) => void;
  onReply: (localThreadId: string, body: string) => void;
  onRespondToPermission: (localThreadId: string, requestId: string, actionId: string) => void;
  fallbackActive: boolean;
}

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

function getMessageAuthorLabel(role: 'assistant' | 'user'): string {
  return role === 'assistant' ? 'Assistant' : 'You';
}

function getLatestProgressText(thread: ReviewLocalThread): string | null {
  const session = thread.activeReplySession;
  if (!session) {
    return null;
  }

  if (session.progressHint?.text) {
    return session.progressHint.text;
  }

  const latestTurn = session.turns.at(-1);
  if (latestTurn?.progressHint?.text) {
    return latestTurn.progressHint.text;
  }

  const latestProgressSegment = [...(latestTurn?.intermediateSegments ?? [])]
    .reverse()
    .find((segment) => segment.kind === 'progress');
  return latestProgressSegment?.text ?? null;
}

function formatResolvedLocation(thread: ReviewLocalThread): string {
  const resolvedLocation =
    thread.draft.resolvedLocation.kind === 'diff' ? thread.draft.resolvedLocation : null;
  return resolvedLocation
    ? `${resolvedLocation.filePath}:L${resolvedLocation.endLine ?? resolvedLocation.startLine ?? '?'}`
    : 'Overview finding';
}

export function LocalThreadPanel({
  threads,
  selectedFileId,
  selectedLocalThreadId,
  onSelectFile,
  onSelectThread,
  onReply,
  onRespondToPermission,
  fallbackActive,
}: LocalThreadPanelProps) {
  const [replyBodies, setReplyBodies] = useState<Record<string, string>>({});

  const sortedThreads = useMemo(
    () =>
      [...threads].sort((left, right) => {
        if (
          left.draft.resolvedLocation.kind === 'overview' &&
          right.draft.resolvedLocation.kind !== 'overview'
        ) {
          return -1;
        }
        if (
          left.draft.resolvedLocation.kind !== 'overview' &&
          right.draft.resolvedLocation.kind === 'overview'
        ) {
          return 1;
        }
        return left.draft.title.localeCompare(right.draft.title, 'ja');
      }),
    [threads],
  );

  const selectedThread =
    sortedThreads.find((thread) => thread.localThreadId === selectedLocalThreadId) ??
    sortedThreads[0] ??
    null;

  const selectedReplyBody = selectedThread ? (replyBodies[selectedThread.localThreadId] ?? '') : '';

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Local Drafts</h2>
            <p className="mt-1 text-xs text-slate-500">
              AI が返した finding を local draft thread として保持します。
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
            {sortedThreads.length} drafts
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {fallbackActive ? (
          <div className="rounded-2xl border border-dashed border-amber-400/20 bg-amber-400/10 px-4 py-6 text-sm text-amber-100">
            structured 化に失敗したため、diff 上の draft thread は生成していません。
          </div>
        ) : sortedThreads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
            draft finding はまだありません。
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="space-y-3">
              {sortedThreads.map((thread) => {
                const resolvedLocation =
                  thread.draft.resolvedLocation.kind === 'diff'
                    ? thread.draft.resolvedLocation
                    : null;
                const isSelected = thread.localThreadId === selectedThread?.localThreadId;
                const isFileActive = resolvedLocation?.fileId === selectedFileId;

                return (
                  <button
                    key={thread.localThreadId}
                    type="button"
                    onClick={() => {
                      if (resolvedLocation) {
                        onSelectFile(resolvedLocation.fileId);
                      }
                      onSelectThread(thread.localThreadId);
                    }}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? 'border-cyan-400/30 bg-cyan-400/10'
                        : isFileActive
                          ? 'border-fuchsia-400/20 bg-fuchsia-400/10'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    }`}
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
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {thread.draft.draftBody}
                      </p>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      {formatResolvedLocation(thread)}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedThread ? (
              <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                    Draft
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${getSeverityBadgeClass(selectedThread.draft.severity)}`}
                  >
                    {selectedThread.draft.severity}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                    {selectedThread.draft.category}
                  </span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    {selectedThread.draft.confidence}
                  </span>
                </div>

                <div className="mt-4">
                  <h3 className="text-base font-semibold text-white">
                    {selectedThread.draft.title}
                  </h3>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {selectedThread.draft.draftBody}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                    {formatResolvedLocation(selectedThread)}
                  </p>
                </div>

                {selectedThread.draft.resolvedLocation.kind === 'overview' &&
                selectedThread.draft.debugDowngrade ? (
                  <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-left text-xs text-amber-100">
                    <p className="font-semibold uppercase tracking-[0.18em] text-amber-200">
                      Debug: diff to overview fallback
                    </p>
                    <p className="mt-2">
                      {getDebugDowngradeReasonLabel(selectedThread.draft.debugDowngrade.reason)}
                    </p>
                    <p className="mt-2 font-mono text-[11px] text-amber-200/90">
                      requested diff:{' '}
                      {formatDebugRequestedLocation(selectedThread.draft.debugDowngrade)}
                    </p>
                  </div>
                ) : null}

                <div className="mt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-white">Thread history</h4>
                    <span className="text-xs text-slate-500">
                      {selectedThread.messages.length} messages
                    </span>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedThread.messages.map((message) => (
                      <div
                        key={message.localMessageId}
                        className={`rounded-2xl border px-3 py-3 ${
                          message.role === 'assistant'
                            ? 'border-fuchsia-400/20 bg-fuchsia-400/10'
                            : 'border-cyan-400/20 bg-cyan-400/10'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                          <span>{getMessageAuthorLabel(message.role)}</span>
                          <span>{message.source}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-100">
                          {message.body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedThread.activeReplySession ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium ${SESSION_STATUS_STYLES[selectedThread.activeReplySession.status]}`}
                      >
                        {SESSION_STATUS_LABELS[selectedThread.activeReplySession.status]}
                      </span>
                      <span className="text-xs text-slate-500">
                        session: {selectedThread.activeReplySession.appSessionId}
                      </span>
                    </div>
                    {getLatestProgressText(selectedThread) ? (
                      <p className="mt-3 text-sm text-slate-300">
                        Progress: {getLatestProgressText(selectedThread)}
                      </p>
                    ) : null}
                    {selectedThread.lastError ? (
                      <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-3 text-sm text-rose-100">
                        {selectedThread.lastError}
                      </div>
                    ) : null}
                    {selectedThread.activeReplySession.pendingPermissions.length > 0 ? (
                      <div className="mt-4 space-y-3">
                        {selectedThread.activeReplySession.pendingPermissions.map((permission) => (
                          <SessionPermissionCard
                            key={permission.requestId}
                            title="Thread permission"
                            description="このスレッド返信に必要な permission request です。"
                            permission={permission}
                            onRespond={(requestId, actionId) => {
                              onRespondToPermission(
                                selectedThread.localThreadId,
                                requestId,
                                actionId,
                              );
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : selectedThread.lastError ? (
                  <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {selectedThread.lastError}
                  </div>
                ) : null}

                <div className="mt-5 border-t border-white/10 pt-4">
                  <label
                    htmlFor={`reply-${selectedThread.localThreadId}`}
                    className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500"
                  >
                    Reply in panel
                  </label>
                  <textarea
                    id={`reply-${selectedThread.localThreadId}`}
                    value={selectedReplyBody}
                    onChange={(event) => {
                      setReplyBodies((current) => ({
                        ...current,
                        [selectedThread.localThreadId]: event.target.value,
                      }));
                    }}
                    placeholder="この finding に対する補足質問や確認事項を入力します。"
                    disabled={selectedThread.replyStatus === 'replying'}
                    className="mt-3 h-28 w-full rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      他 thread の文脈は送らず、この finding の履歴だけで会話を継続します。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onReply(selectedThread.localThreadId, selectedReplyBody);
                        setReplyBodies((current) => ({
                          ...current,
                          [selectedThread.localThreadId]: '',
                        }));
                      }}
                      disabled={
                        selectedThread.replyStatus === 'replying' ||
                        selectedReplyBody.trim().length === 0
                      }
                      className="rounded-full bg-cyan-400/20 px-4 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/30 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
                    >
                      {selectedThread.replyStatus === 'replying' ? 'Replying…' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
