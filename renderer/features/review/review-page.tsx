import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { SplitSide } from '@git-diff-view/react';
import type { AgentKind } from '../../../shared/domain/agent';
import type { ReviewProvider, ReviewSourceDraft } from '../../../shared/domain/review';
import { SessionEventPanel } from '../../components/session-event-panel';
import { DiffFilePane } from './diff-file-pane';
import { LocalThreadPanel } from './local-thread-panel';
import { OverviewDiscussionPanel } from './overview-discussion-panel';
import { ReviewExecutionBar } from './review-execution-bar';
import { ReviewSummaryPanel } from './review-summary-panel';
import {
  getDefaultReviewHost,
  inferProviderFromReviewUrl,
  isReviewProvider,
  serializeReviewSource,
} from './review-source';
import { ReviewSourceSelector } from './review-source-selector';
import { useReviewData } from './use-review-data';
import { useReviewDraft } from './use-review-draft';
import { useReviewState } from './use-review-state';

function getQueryValue(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function getFileStatusLabel(contentStatus: string, isBinary: boolean): string {
  if (isBinary) {
    return 'binary';
  }

  switch (contentStatus) {
    case 'loaded':
      return 'ready';
    case 'loading':
      return 'loading';
    case 'failed':
      return 'failed';
    default:
      return 'lazy';
  }
}

export function ReviewPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<ReviewProvider>('github');
  const [host, setHost] = useState(getDefaultReviewHost('github'));
  const [reviewUrl, setReviewUrl] = useState('');
  const [reviewAgent, setReviewAgent] = useState<AgentKind>('codex');
  const [reviewInstructions, setReviewInstructions] = useState(
    '全体の設計、テスト、保守性の観点からレビューして。\n指摘は重大度付きで、改善提案も含めて。',
  );
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [activeRightPaneTab, setActiveRightPaneTab] = useState<'drafts' | 'overview'>('drafts');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, loading, error, initialSelectedFileId, loadSource } = useReviewData();
  const reviewState = useReviewState();
  const reviewDraft = useReviewDraft();
  const lastLoadedSourceKeyRef = useRef<string | null>(null);
  const activeSnapshotIdRef = useRef('');
  const hydratingFileKeysRef = useRef(new Set<string>());
  const prevReviewStatusRef = useRef<string | null>(null);

  const querySource = useMemo<ReviewSourceDraft | null>(() => {
    if (!router.isReady) {
      return null;
    }

    const nextReviewUrl = getQueryValue(router.query.reviewUrl).trim();
    if (!nextReviewUrl) {
      return null;
    }

    const queryProvider = getQueryValue(router.query.provider).trim();
    const nextProvider =
      (isReviewProvider(queryProvider)
        ? queryProvider
        : inferProviderFromReviewUrl(nextReviewUrl)) ?? 'github';
    const nextHost = getQueryValue(router.query.host).trim() || getDefaultReviewHost(nextProvider);

    return {
      provider: nextProvider,
      host: nextHost,
      reviewUrl: nextReviewUrl,
    };
  }, [router.isReady, router.query.host, router.query.provider, router.query.reviewUrl]);

  useEffect(() => {
    if (!router.isReady) {
      return;
    }

    if (querySource) {
      setProvider(querySource.provider);
      setHost(querySource.host);
      setReviewUrl(querySource.reviewUrl);
      return;
    }

    setProvider('github');
    setHost(getDefaultReviewHost('github'));
    setReviewUrl('');
  }, [router.isReady, querySource]);

  useEffect(() => {
    if (!querySource) {
      return;
    }

    const sourceKey = serializeReviewSource(querySource);
    if (sourceKey === lastLoadedSourceKeyRef.current) {
      return;
    }

    lastLoadedSourceKeyRef.current = sourceKey;
    void loadSource(querySource);
  }, [querySource, loadSource]);

  useEffect(() => {
    if (data) {
      reviewState.reset(data);
    }
  }, [data, reviewState.reset]);

  useEffect(() => {
    reviewDraft.resetReviewDraftState();
    setActiveRightPaneTab('drafts');
  }, [reviewState.data.snapshotId, reviewDraft.resetReviewDraftState]);

  useEffect(() => {
    activeSnapshotIdRef.current = reviewState.data.snapshotId;
  }, [reviewState.data.snapshotId]);

  useEffect(() => {
    setIsDescriptionOpen(false);
  }, [reviewState.data.snapshotId]);

  useEffect(() => {
    if (!reviewState.data.snapshotId) {
      setSelectedFileId(null);
      return;
    }

    const nextSelectedFileId = initialSelectedFileId ?? reviewState.data.files[0]?.fileId ?? null;
    setSelectedFileId(nextSelectedFileId);
  }, [initialSelectedFileId, reviewState.data.snapshotId, reviewState.data.files[0]?.fileId]);

  const selectedFile = useMemo(
    () =>
      selectedFileId
        ? (reviewState.data.files.find((file) => file.fileId === selectedFileId) ?? null)
        : null,
    [reviewState.data.files, selectedFileId],
  );

  const selectedDraftThreads = useMemo(
    () =>
      reviewDraft.reviewDraftState.localDraftThreads.filter(
        (thread) =>
          thread.anchor !== null &&
          thread.resolvedLocation.kind === 'diff' &&
          thread.resolvedLocation.fileId === selectedFileId,
      ),
    [reviewDraft.reviewDraftState.localDraftThreads, selectedFileId],
  );

  const draftCountByFileId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const thread of reviewDraft.reviewDraftState.localDraftThreads) {
      if (thread.resolvedLocation.kind !== 'diff') {
        continue;
      }

      counts.set(
        thread.resolvedLocation.fileId,
        (counts.get(thread.resolvedLocation.fileId) ?? 0) + 1,
      );
    }

    return counts;
  }, [reviewDraft.reviewDraftState.localDraftThreads]);

  useEffect(() => {
    if (!selectedFile || selectedFile.contentStatus !== 'idle') {
      return;
    }

    const snapshotId = reviewState.data.snapshotId;
    if (!snapshotId) {
      return;
    }

    const hydrationKey = `${snapshotId}:${selectedFile.fileId}`;
    if (hydratingFileKeysRef.current.has(hydrationKey)) {
      return;
    }

    hydratingFileKeysRef.current.add(hydrationKey);
    reviewState.setFileContentStatus(selectedFile.fileId, 'loading');

    window.reviewApi
      .hydrateReviewFile({
        snapshotId,
        fileId: selectedFile.fileId,
      })
      .then((result) => {
        if (activeSnapshotIdRef.current === snapshotId) {
          reviewState.replaceFile(result.file);
        }
      })
      .catch((err: unknown) => {
        console.error('[hydrateReviewFile] Failed to hydrate review file:', err);
        if (activeSnapshotIdRef.current === snapshotId) {
          reviewState.setFileContentStatus(selectedFile.fileId, 'failed');
        }
      })
      .finally(() => {
        hydratingFileKeysRef.current.delete(hydrationKey);
      });
  }, [
    selectedFile,
    reviewState.data.snapshotId,
    reviewState.replaceFile,
    reviewState.setFileContentStatus,
  ]);

  const overviewThreads = useMemo(
    () => reviewState.data.discussions.filter((thread) => thread.location.kind === 'overview'),
    [reviewState.data.discussions],
  );

  useEffect(() => {
    const currentStatus = reviewDraft.reviewDraftState.reviewStatus;
    const prevStatus = prevReviewStatusRef.current;
    prevReviewStatusRef.current = currentStatus;

    if (currentStatus !== 'showing_local_threads' || prevStatus === 'showing_local_threads') {
      return;
    }

    if (selectedFileId !== null) {
      return;
    }

    const firstDiffThread = reviewDraft.reviewDraftState.localDraftThreads.find(
      (thread) => thread.resolvedLocation.kind === 'diff',
    );
    if (firstDiffThread && firstDiffThread.resolvedLocation.kind === 'diff') {
      setSelectedFileId(firstDiffThread.resolvedLocation.fileId);
    }
  }, [reviewDraft.reviewDraftState.reviewStatus, selectedFileId]);

  const handleStartDraftReview = useCallback(async () => {
    if (!reviewState.data.snapshotId) {
      return;
    }

    const result = await reviewDraft.startDraftReview({
      snapshotId: reviewState.data.snapshotId,
      reviewAgent,
      instructions: reviewInstructions,
    });

    if (result) {
      setActiveRightPaneTab('drafts');
    }
  }, [reviewDraft, reviewAgent, reviewInstructions, reviewState.data.snapshotId]);

  const handleProviderSwitch = useCallback((nextProvider: ReviewProvider) => {
    setProvider(nextProvider);
    setHost(getDefaultReviewHost(nextProvider));
    setValidationError(null);
  }, []);

  const handleLoad = useCallback(() => {
    const nextReviewUrl = reviewUrl.trim();
    if (!nextReviewUrl) {
      setValidationError('Review URL を入力してください。');
      return;
    }

    const nextHost = host.trim() || getDefaultReviewHost(provider);
    if (!nextHost) {
      setValidationError('Host を入力してください。');
      return;
    }

    const nextSource: ReviewSourceDraft = {
      provider,
      host: nextHost,
      reviewUrl: nextReviewUrl,
    };

    setValidationError(null);
    lastLoadedSourceKeyRef.current = serializeReviewSource(nextSource);

    void router.replace(
      {
        pathname: '/mr',
        query: {
          provider: nextSource.provider,
          host: nextSource.host,
          reviewUrl: nextSource.reviewUrl,
        },
      },
      undefined,
      { shallow: true },
    );

    void loadSource(nextSource);
  }, [host, loadSource, provider, reviewUrl, router]);

  const handleAddComment = useCallback(
    (fileId: string, startLine: number | null, endLine: number, side: SplitSide, body: string) => {
      reviewState.createThreadOptimistic(fileId, startLine, endLine, side, body);
    },
    [reviewState.createThreadOptimistic],
  );

  const handleReply = useCallback(
    (threadId: string, body: string) => {
      reviewState.replyThreadOptimistic(threadId, body);
    },
    [reviewState.replyThreadOptimistic],
  );

  const reviewTitle = reviewState.data.title || 'Review Snapshot';
  const reviewDescription =
    reviewState.data.description ||
    '説明はまだありません。overview discussion を右側に表示します。';
  const hasLoadedReview = Boolean(reviewState.data.snapshotId);
  const isFallbackActive = reviewDraft.reviewDraftState.fallbackRichText !== null;

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-950/90 backdrop-blur">
        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                void router.push('/home');
              }}
              className="text-sm text-slate-400 transition hover:text-white"
            >
              ← Home
            </button>
            <div className="h-4 w-px bg-white/10" />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{reviewTitle}</h1>
              <p className="mt-1 text-xs text-slate-500">
                {hasLoadedReview
                  ? `${reviewState.data.files.length} files / ${overviewThreads.length} overview threads`
                  : 'GitHub / GitLab の PR・MR URL を入力して読み込みます。'}
              </p>
            </div>
            {hasLoadedReview ? (
              <a
                href={reviewState.data.providerContext.reviewUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                Open source
              </a>
            ) : null}
          </div>

          <ReviewSourceSelector
            provider={provider}
            host={host}
            reviewUrl={reviewUrl}
            loading={loading}
            error={validationError ?? error}
            onProviderChange={handleProviderSwitch}
            onHostChange={(value) => {
              setHost(value);
              setValidationError(null);
            }}
            onReviewUrlChange={(value) => {
              setReviewUrl(value);
              setValidationError(null);
            }}
            onSubmit={handleLoad}
          />

          <ReviewExecutionBar
            reviewAgent={reviewAgent}
            instructions={reviewInstructions}
            disabled={!hasLoadedReview}
            running={reviewDraft.isRunning}
            error={reviewDraft.reviewDraftState.errorMessage}
            onReviewAgentChange={setReviewAgent}
            onInstructionsChange={setReviewInstructions}
            onSubmit={handleStartDraftReview}
          />
        </div>
      </header>

      {hasLoadedReview ? (
        <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
          <aside className="w-full shrink-0 border-b border-white/10 bg-white/[0.02] xl:w-[300px] xl:border-b-0 xl:border-r">
            <div className="max-h-[240px] overflow-y-auto p-3 xl:max-h-none xl:h-full">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Files
                </span>
                <span className="text-xs text-slate-500">{reviewState.data.files.length}</span>
              </div>

              <div className="space-y-1.5">
                {reviewState.data.files.map((file) => {
                  const isActive = file.fileId === selectedFileId;

                  return (
                    <button
                      key={file.fileId}
                      onClick={() => setSelectedFileId(file.fileId)}
                      className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition ${
                        isActive
                          ? 'border-cyan-400/30 bg-cyan-400/10 text-white'
                          : 'border-transparent bg-white/[0.03] text-slate-300 hover:border-white/10 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {file.oldFilePath && file.changeType === 'renamed'
                            ? `${file.oldFilePath} → ${file.filePath}`
                            : file.filePath}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                          <span>{file.changeType}</span>
                          <span>{getFileStatusLabel(file.contentStatus, file.isBinary)}</span>
                          {file.threads.length > 0 ? (
                            <span>{file.threads.length} remote</span>
                          ) : null}
                          {(draftCountByFileId.get(file.fileId) ?? 0) > 0 ? (
                            <span>{draftCountByFileId.get(file.fileId)} drafts</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-[11px]">
                        <div className="text-green-400">+{file.additions}</div>
                        <div className="text-red-400">-{file.deletions}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          <main
            className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5"
            style={{ overflowAnchor: 'auto', scrollBehavior: 'auto' }}
          >
            <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03]">
              <button
                type="button"
                onClick={() => setIsDescriptionOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Description
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {isDescriptionOpen ? 'クリックで閉じる' : 'クリックで表示'}
                  </p>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-slate-400 transition-transform duration-200"
                  style={{
                    transform: isDescriptionOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isDescriptionOpen ? (
                <div className="border-t border-white/10 px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                    {reviewDescription}
                  </p>
                </div>
              ) : null}
            </div>

            {selectedFile ? (
              <DiffFilePane
                key={selectedFile.fileId}
                file={selectedFile}
                remoteThreads={selectedFile.threads}
                draftThreads={selectedDraftThreads}
                onAddComment={handleAddComment}
                onReply={handleReply}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
                表示するファイルがありません。
              </div>
            )}
          </main>

          <aside className="flex w-full shrink-0 flex-col border-t border-white/10 bg-white/[0.02] xl:w-[380px] xl:border-t-0 xl:border-l">
            <ReviewSummaryPanel
              status={reviewDraft.reviewDraftState.reviewStatus}
              latestRun={reviewDraft.reviewDraftState.latestRun}
              summary={reviewDraft.reviewDraftState.summary}
              fallbackRichText={reviewDraft.reviewDraftState.fallbackRichText}
              fallbackReason={reviewDraft.reviewDraftState.fallbackReason}
              threadCount={reviewDraft.reviewDraftState.localDraftThreads.length}
              error={reviewDraft.reviewDraftState.errorMessage}
            />

            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <button
                type="button"
                onClick={() => setActiveRightPaneTab('drafts')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeRightPaneTab === 'drafts'
                    ? 'bg-fuchsia-500/20 text-fuchsia-200'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Drafts
              </button>
              <button
                type="button"
                onClick={() => setActiveRightPaneTab('overview')}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  activeRightPaneTab === 'overview'
                    ? 'bg-amber-500/20 text-amber-100'
                    : 'bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                Overview
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                {activeRightPaneTab === 'drafts' ? (
                  <LocalThreadPanel
                    threads={reviewDraft.reviewDraftState.localDraftThreads}
                    selectedFileId={selectedFileId}
                    onSelectFile={setSelectedFileId}
                    fallbackActive={isFallbackActive}
                  />
                ) : (
                  <OverviewDiscussionPanel threads={overviewThreads} onReply={handleReply} />
                )}
              </div>

              <div className="border-t border-white/10 px-4 py-4">
                <SessionEventPanel
                  pendingSessionId={reviewDraft.reviewDraftState.activeRunSessionId}
                  session={reviewDraft.reviewDraftState.activeRunSession}
                />
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <main className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-xl rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
              Real Review Snapshot
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Review URL を入力して diff を読み込みます
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              左側の file list にはメタデータだけを先に出し、本文は選択ファイルごとに lazy hydrate
              します。overview discussion は右側パネルに分離して表示します。
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
