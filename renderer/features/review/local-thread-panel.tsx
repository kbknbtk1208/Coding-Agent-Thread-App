import React, { useMemo } from 'react';
import type { ReviewThreadDraft } from '../../../shared/domain/review-draft';

interface LocalThreadPanelProps {
  threads: ReviewThreadDraft[];
  selectedFileId: string | null;
  onSelectFile: (fileId: string) => void;
  fallbackActive: boolean;
}

function getSeverityBadgeClass(severity: ReviewThreadDraft['severity']): string {
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
  reason: NonNullable<ReviewThreadDraft['debugDowngrade']>['reason'],
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
  debugDowngrade: NonNullable<ReviewThreadDraft['debugDowngrade']>,
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

export function LocalThreadPanel({
  threads,
  selectedFileId,
  onSelectFile,
  fallbackActive,
}: LocalThreadPanelProps) {
  const sortedThreads = useMemo(
    () =>
      [...threads].sort((left, right) => {
        if (
          left.resolvedLocation.kind === 'overview' &&
          right.resolvedLocation.kind !== 'overview'
        ) {
          return -1;
        }
        if (
          left.resolvedLocation.kind !== 'overview' &&
          right.resolvedLocation.kind === 'overview'
        ) {
          return 1;
        }
        return left.title.localeCompare(right.title, 'ja');
      }),
    [threads],
  );

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
          <div className="space-y-3">
            {sortedThreads.map((thread) => {
              const resolvedLocation =
                thread.resolvedLocation.kind === 'diff' ? thread.resolvedLocation : null;
              const isActive = resolvedLocation?.fileId === selectedFileId;

              return (
                <button
                  key={thread.localThreadId}
                  type="button"
                  onClick={() => {
                    if (resolvedLocation) {
                      onSelectFile(resolvedLocation.fileId);
                    }
                  }}
                  className={`w-full rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? 'border-cyan-400/30 bg-cyan-400/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                      Draft
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${getSeverityBadgeClass(thread.severity)}`}
                    >
                      {thread.severity}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                      {thread.category}
                    </span>
                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                      {thread.confidence}
                    </span>
                  </div>

                  <div className="mt-3">
                    <h3 className="text-sm font-semibold text-white">{thread.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                      {thread.draftBody}
                    </p>
                  </div>

                  <div className="mt-3 text-xs text-slate-500">
                    {resolvedLocation
                      ? `${resolvedLocation.filePath}:L${resolvedLocation.endLine ?? resolvedLocation.startLine ?? '?'}`
                      : 'Overview finding'}
                  </div>

                  {!resolvedLocation && thread.debugDowngrade && (
                    <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-3 text-left text-xs text-amber-100">
                      <p className="font-semibold uppercase tracking-[0.18em] text-amber-200">
                        Debug: diff to overview fallback
                      </p>
                      <p className="mt-2">
                        {getDebugDowngradeReasonLabel(thread.debugDowngrade.reason)}
                      </p>
                      <p className="mt-2 font-mono text-[11px] text-amber-200/90">
                        requested diff: {formatDebugRequestedLocation(thread.debugDowngrade)}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
