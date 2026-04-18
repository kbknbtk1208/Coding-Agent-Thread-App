import React from 'react';
import type { ReviewSnapshotFile } from '../../../shared/domain/review';
import type { ReviewPublishDraft } from '../../../shared/domain/review-publish';
import type { ReviewPublishState } from './use-review-publish';

function severityLabel(severity: 'high' | 'medium' | 'low'): string {
  switch (severity) {
    case 'high':
      return 'High';
    case 'medium':
      return 'Medium';
    case 'low':
      return 'Low';
  }
}

function findEligibleDiffFile(files: ReviewSnapshotFile[]): ReviewSnapshotFile | null {
  return files.find((file) => !file.isBinary && !file.isLargeDiff) ?? files[0] ?? null;
}

function buildDefaultDiffLocation(
  files: ReviewSnapshotFile[],
): ReviewPublishDraft['location'] | null {
  const file = findEligibleDiffFile(files);
  if (!file) {
    return null;
  }

  return {
    kind: 'diff',
    fileId: file.fileId,
    filePath: file.filePath,
    side: file.changeType === 'deleted' ? 'old' : 'new',
    startLine: 1,
    endLine: 1,
  };
}

interface PublishDraftCardProps {
  draft: ReviewPublishDraft;
  files: ReviewSnapshotFile[];
  isSelected: boolean;
  isPublishing: boolean;
  snapshotId: string;
  onToggleSelect: (id: string) => void;
  onDraftChange: (draft: ReviewPublishDraft, snapshotId: string) => void;
}

function PublishDraftCard({
  draft,
  files,
  isSelected,
  isPublishing,
  snapshotId,
  onToggleSelect,
  onDraftChange,
}: PublishDraftCardProps) {
  const isLocked = isPublishing || draft.state === 'published' || draft.state === 'publishing';
  let selectedFile: ReviewSnapshotFile | null = null;
  if (draft.location.kind === 'diff') {
    const location = draft.location;
    selectedFile = files.find((file) => file.fileId === location.fileId) ?? null;
  }

  const stateLabel =
    draft.state === 'published'
      ? '投稿済み'
      : draft.state === 'failed'
        ? '失敗'
        : draft.state === 'publishing'
          ? '投稿中'
          : draft.state === 'edited'
            ? '編集中'
            : null;

  const handleLocationKindChange = (kind: 'overview' | 'diff') => {
    if (kind === 'overview') {
      onDraftChange(
        {
          ...draft,
          location: { kind: 'overview' },
          anchor: null,
        },
        snapshotId,
      );
      return;
    }

    const nextLocation = buildDefaultDiffLocation(files);
    if (!nextLocation) {
      return;
    }

    onDraftChange(
      {
        ...draft,
        location: nextLocation,
        anchor: null,
      },
      snapshotId,
    );
  };

  const handleDiffFieldChange = (
    field: 'fileId' | 'side' | 'startLine' | 'endLine',
    value: string,
  ) => {
    if (draft.location.kind !== 'diff') {
      return;
    }

    let nextLocation: ReviewPublishDraft['location'] = { ...draft.location };

    if (field === 'fileId') {
      const nextFile = files.find((file) => file.fileId === value);
      if (!nextFile) {
        return;
      }

      nextLocation = {
        ...draft.location,
        fileId: nextFile.fileId,
        filePath: nextFile.filePath,
        side: nextFile.changeType === 'deleted' ? 'old' : draft.location.side,
      };
    } else if (field === 'side') {
      nextLocation = {
        ...draft.location,
        side: value === 'old' ? 'old' : 'new',
      };
    } else {
      const nextNumber = value.trim() ? Number(value) : null;
      nextLocation = {
        ...draft.location,
        [field]: Number.isNaN(nextNumber) ? null : nextNumber,
      };
    }

    onDraftChange(
      {
        ...draft,
        location: nextLocation,
        anchor: null,
      },
      snapshotId,
    );
  };

  return (
    <section
      className={`rounded-[12px] border p-4 transition ${
        isSelected ? 'border-[#FFA16C]/30 bg-[#FFA16C]/10' : 'border-white/10 bg-white/[0.03]'
      } ${draft.state === 'published' || isPublishing ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        {draft.state !== 'published' ? (
          <input
            type="checkbox"
            checked={isSelected}
            disabled={isLocked}
            onChange={() => onToggleSelect(draft.publishDraftId)}
            className="mt-1 shrink-0 accent-cyan-400"
            aria-label={`${draft.title} を選択`}
          />
        ) : (
          <span className="mt-1 text-xs text-[#4EBE96]">✓</span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#f8f7f4]">{draft.title}</h3>
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d0d5db]">
              {severityLabel(draft.severity)}
            </span>
            {stateLabel ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[#d0d5db]">
                {stateLabel}
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-3">
            <textarea
              value={draft.body}
              onChange={(event) =>
                void onDraftChange(
                  {
                    ...draft,
                    body: event.target.value,
                  },
                  snapshotId,
                )
              }
              disabled={isLocked}
              rows={5}
              className="w-full resize-none rounded-[10px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea] focus:border-[#FFA16C]/40 focus:outline-none disabled:opacity-50"
              aria-label={`${draft.title} の本文`}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-[#b3b9c2]">
                <span>Location</span>
                <select
                  value={draft.location.kind}
                  onChange={(event) =>
                    handleLocationKindChange(event.target.value === 'diff' ? 'diff' : 'overview')
                  }
                  disabled={isLocked}
                  className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea]"
                >
                  <option value="overview">overview</option>
                  <option value="diff">diff</option>
                </select>
              </label>

              {draft.location.kind === 'diff' ? (
                <label className="flex flex-col gap-1 text-xs text-[#b3b9c2]">
                  <span>Side</span>
                  <select
                    value={draft.location.side}
                    onChange={(event) => handleDiffFieldChange('side', event.target.value)}
                    disabled={isLocked}
                    className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea]"
                  >
                    <option value="new">new</option>
                    <option value="old">old</option>
                  </select>
                </label>
              ) : null}

              {draft.location.kind === 'diff' ? (
                <label className="flex flex-col gap-1 text-xs text-[#b3b9c2] md:col-span-2">
                  <span>File</span>
                  <select
                    value={draft.location.fileId}
                    onChange={(event) => handleDiffFieldChange('fileId', event.target.value)}
                    disabled={isLocked}
                    className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea]"
                  >
                    {files.map((file) => (
                      <option key={file.fileId} value={file.fileId}>
                        {file.filePath}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              {draft.location.kind === 'diff' ? (
                <>
                  <label className="flex flex-col gap-1 text-xs text-[#b3b9c2]">
                    <span>Start line</span>
                    <input
                      type="number"
                      min={1}
                      value={draft.location.startLine ?? ''}
                      onChange={(event) => handleDiffFieldChange('startLine', event.target.value)}
                      disabled={isLocked}
                      className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea]"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs text-[#b3b9c2]">
                    <span>End line</span>
                    <input
                      type="number"
                      min={1}
                      value={draft.location.endLine ?? ''}
                      onChange={(event) => handleDiffFieldChange('endLine', event.target.value)}
                      disabled={isLocked}
                      className="rounded-[8px] border border-white/10 bg-black/35 px-3 py-2 text-sm text-[#f4f1ea]"
                    />
                  </label>
                </>
              ) : null}
            </div>

            {selectedFile?.isBinary || selectedFile?.isLargeDiff ? (
              <p className="text-xs text-[#FFA16C]">
                このファイルは diff 投稿に向かないため、overview へ切り替える必要があります。
              </p>
            ) : null}

            {draft.lastError ? <p className="text-xs text-[#FF5C5C]">{draft.lastError}</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

interface PublishDraftPanelProps {
  publishState: ReviewPublishState;
  files: ReviewSnapshotFile[];
  snapshotId: string;
  onClose: () => void;
  onToggleSelect: (publishDraftId: string) => void;
  onDraftChange: (draft: ReviewPublishDraft, snapshotId: string) => Promise<void>;
  onConfirmPublish: (snapshotId: string) => Promise<void>;
}

export function PublishDraftPanel({
  publishState,
  files,
  snapshotId,
  onClose,
  onToggleSelect,
  onDraftChange,
  onConfirmPublish,
}: PublishDraftPanelProps) {
  if (!publishState.isPanelOpen) {
    return null;
  }

  const visibleDrafts = publishState.drafts.filter((draft) => draft.state !== 'published');
  const selectedCount = publishState.selectedDraftIds.filter((id) =>
    visibleDrafts.some((draft) => draft.publishDraftId === id),
  ).length;
  const isPublishing = publishState.publishStatus === 'publishing';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/70 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isPublishing) {
          onClose();
        }
      }}
    >
      <aside className="flex h-full w-full max-w-[560px] flex-col border-l border-white/10 bg-[#050505] shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_rgba(0,0,0,0.55)]">
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#f8f7f4]">投稿前確認</h2>
            <p className="text-xs text-[#8b949e]">
              {visibleDrafts.length} 件中 {selectedCount} 件選択
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-[8px] px-2 py-1.5 text-xs text-[#8b949e] hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {visibleDrafts.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8b949e]">投稿候補がありません。</p>
          ) : (
            visibleDrafts.map((draft) => (
              <PublishDraftCard
                key={draft.publishDraftId}
                draft={draft}
                files={files}
                isSelected={publishState.selectedDraftIds.includes(draft.publishDraftId)}
                isPublishing={isPublishing}
                snapshotId={snapshotId}
                onToggleSelect={onToggleSelect}
                onDraftChange={onDraftChange}
              />
            ))
          )}
        </div>

        {publishState.errorMessage ? (
          <div className="border-t border-[#FF5C5C]/20 bg-[#FF5C5C]/5 px-4 py-2">
            <p className="text-xs text-[#FF5C5C]">{publishState.errorMessage}</p>
          </div>
        ) : null}

        <footer className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="rounded-[8px] px-3 py-1.5 text-xs text-[#8b949e] hover:bg-white/10 hover:text-white disabled:opacity-50"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={() => void onConfirmPublish(snapshotId)}
            disabled={isPublishing || selectedCount === 0}
            className="rounded-[8px] bg-[#FFA16C] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#ffb98d] disabled:opacity-50"
          >
            {isPublishing ? '投稿中…' : `投稿を確定 (${selectedCount})`}
          </button>
        </footer>
      </aside>
    </div>
  );
}
