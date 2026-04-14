import { SplitSide } from '@git-diff-view/react';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentKind } from '../../../shared/domain/agent';
import type { ReviewProvider, ReviewSourceDraft } from '../../../shared/domain/review';
import { DiffFilePane } from './diff-file-pane';
import { OverviewDiscussionPanel } from './overview-discussion-panel';
import { OverviewDraftThreadSection } from './overview-draft-thread-section';
import { PublishDraftPanel } from './publish-draft-panel';
import { ReviewActionPanel } from './review-action-panel';
import {
  getDefaultReviewHost,
  inferProviderFromReviewUrl,
  isReviewProvider,
  serializeReviewSource,
} from './review-source';
import { ReviewSourceSelector } from './review-source-selector';
import { useDraftComposerState } from './use-draft-composer-state';
import { useReviewData } from './use-review-data';
import { useReviewDraft } from './use-review-draft';
import { useReviewPublish } from './use-review-publish';
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
  const [selectedLocalThreadId, setSelectedLocalThreadId] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const { data, loading, error, initialSelectedFileId, loadSource } = useReviewData();
  const reviewState = useReviewState();
  const reviewDraft = useReviewDraft();
  const draftComposer = useDraftComposerState();
  const reviewPublish = useReviewPublish();
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
    draftComposer.clearAll();
    reviewPublish.reset();
    setSelectedLocalThreadId(null);
  }, [
    reviewState.data.snapshotId,
    reviewDraft.resetReviewDraftState,
    draftComposer.clearAll,
    reviewPublish.reset,
  ]);

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

  const publishedLocalThreadIds = useMemo(
    () =>
      new Set(
        reviewPublish.publishState.drafts
          .filter((draft) => draft.state === 'published')
          .map((draft) => draft.localThreadId),
      ),
    [reviewPublish.publishState.drafts],
  );

  const visibleDraftThreads = useMemo(
    () =>
      reviewDraft.reviewDraftState.localThreads.filter(
        (thread) => !publishedLocalThreadIds.has(thread.localThreadId),
      ),
    [publishedLocalThreadIds, reviewDraft.reviewDraftState.localThreads],
  );

  const selectedDraftThreads = useMemo(
    () =>
      visibleDraftThreads.filter(
        (thread) =>
          thread.draft.anchor !== null &&
          thread.draft.resolvedLocation.kind === 'diff' &&
          thread.draft.resolvedLocation.fileId === selectedFileId,
      ),
    [selectedFileId, visibleDraftThreads],
  );

  const overviewDraftThreads = useMemo(
    () => visibleDraftThreads.filter((thread) => thread.draft.resolvedLocation.kind === 'overview'),
    [visibleDraftThreads],
  );

  const draftCountByFileId = useMemo(() => {
    const counts = new Map<string, number>();

    for (const thread of visibleDraftThreads) {
      if (thread.draft.resolvedLocation.kind !== 'diff') {
        continue;
      }

      counts.set(
        thread.draft.resolvedLocation.fileId,
        (counts.get(thread.draft.resolvedLocation.fileId) ?? 0) + 1,
      );
    }

    return counts;
  }, [visibleDraftThreads]);

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

    const firstDiffThread = visibleDraftThreads.find(
      (thread) => thread.draft.resolvedLocation.kind === 'diff',
    );
    if (firstDiffThread && firstDiffThread.draft.resolvedLocation.kind === 'diff') {
      setSelectedFileId(firstDiffThread.draft.resolvedLocation.fileId);
    }
    if (visibleDraftThreads.length > 0) {
      setSelectedLocalThreadId(visibleDraftThreads[0]?.localThreadId ?? null);
    }
  }, [reviewDraft.reviewDraftState.reviewStatus, selectedFileId, visibleDraftThreads]);

  useEffect(() => {
    if (
      selectedLocalThreadId &&
      visibleDraftThreads.some((thread) => thread.localThreadId === selectedLocalThreadId)
    ) {
      return;
    }

    setSelectedLocalThreadId(visibleDraftThreads[0]?.localThreadId ?? null);
  }, [selectedLocalThreadId, visibleDraftThreads]);

  useEffect(() => {
    if (!selectedLocalThreadId) {
      return;
    }

    const selectedThread = visibleDraftThreads.find(
      (thread) => thread.localThreadId === selectedLocalThreadId,
    );
    if (!selectedThread || selectedThread.draft.resolvedLocation.kind !== 'diff') {
      return;
    }

    if (selectedThread.draft.resolvedLocation.fileId !== selectedFileId) {
      setSelectedFileId(selectedThread.draft.resolvedLocation.fileId);
    }
  }, [selectedFileId, selectedLocalThreadId, visibleDraftThreads]);

  const handleStartDraftReview = useCallback(async () => {
    if (!reviewState.data.snapshotId) {
      return;
    }

    await reviewDraft.startDraftReview({
      snapshotId: reviewState.data.snapshotId,
      reviewAgent,
      instructions: reviewInstructions,
    });
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

  const handleReplyLocalThread = useCallback(
    (localThreadId: string, body: string) => {
      const replyBody = body;
      if (!replyBody.trim()) {
        return;
      }

      draftComposer.clearReplyBody(localThreadId);
      void reviewDraft.replyToLocalThread(localThreadId, replyBody);
    },
    [draftComposer, reviewDraft],
  );

  const handleRespondThreadPermission = useCallback(
    (localThreadId: string, requestId: string, actionId: string) => {
      void reviewDraft.respondToThreadPermission(localThreadId, requestId, actionId);
    },
    [reviewDraft],
  );

  const handleSelectDraftThread = useCallback(
    (localThreadId: string) => {
      setSelectedLocalThreadId(localThreadId);
      const thread = visibleDraftThreads.find(
        (candidate) => candidate.localThreadId === localThreadId,
      );
      if (thread?.draft.resolvedLocation.kind === 'diff') {
        setSelectedFileId(thread.draft.resolvedLocation.fileId);
      }
    },
    [visibleDraftThreads],
  );

  const handleOpenPublishPanel = useCallback(() => {
    const snapshotId = reviewState.data.snapshotId;
    if (!snapshotId) {
      return;
    }
    void reviewPublish.openPanel(snapshotId);
  }, [reviewPublish, reviewState.data.snapshotId]);

  const handleConfirmPublish = useCallback(
    async (snapshotId: string) => {
      const remoteThreads = await reviewPublish.confirmPublish(snapshotId);
      if (remoteThreads.length > 0) {
        reviewState.mergeRemoteThreads(remoteThreads);
      }
    },
    [reviewPublish, reviewState],
  );

  const unpublishedDraftCount = visibleDraftThreads.length;

  const reviewTitle = reviewState.data.title || 'Review Snapshot';
  const reviewDescription =
    reviewState.data.description ||
    '説明はまだありません。overview discussion と draft thread は main content 側で確認できます。';
  const hasLoadedReview = Boolean(reviewState.data.snapshotId);
  const overviewConversationCount = overviewThreads.length + overviewDraftThreads.length;

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
                  ? `${reviewState.data.files.length} files / ${overviewConversationCount} overview conversations`
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

          {hasLoadedReview ? (
            <>
              <ReviewActionPanel
                reviewStatus={reviewDraft.reviewDraftState.reviewStatus}
                reviewAgent={reviewAgent}
                instructions={reviewInstructions}
                disabled={!hasLoadedReview}
                running={reviewDraft.isRunning}
                executionError={reviewDraft.reviewDraftState.errorMessage}
                onReviewAgentChange={setReviewAgent}
                onInstructionsChange={setReviewInstructions}
                onSubmit={handleStartDraftReview}
                pendingSessionId={reviewDraft.reviewDraftState.activeRunSessionId}
                session={reviewDraft.reviewDraftState.activeRunSession}
                latestRun={reviewDraft.reviewDraftState.latestRun}
                summary={reviewDraft.reviewDraftState.summary}
                fallbackRichText={reviewDraft.reviewDraftState.fallbackRichText}
                fallbackReason={reviewDraft.reviewDraftState.fallbackReason}
                threadCount={visibleDraftThreads.length}
                overviewConversationCount={overviewConversationCount}
                unpublishedDraftCount={unpublishedDraftCount}
                isPublishing={reviewPublish.publishState.publishStatus === 'publishing'}
                publishError={
                  reviewPublish.publishState.publishStatus === 'failed'
                    ? reviewPublish.publishState.errorMessage
                    : null
                }
                onOpenPublishPanel={handleOpenPublishPanel}
              />
              {reviewState.data.snapshotId != null && (
                <PublishDraftPanel
                  publishState={reviewPublish.publishState}
                  files={reviewState.data.files}
                  snapshotId={reviewState.data.snapshotId}
                  onClose={reviewPublish.closePanel}
                  onToggleSelect={reviewPublish.toggleDraftSelection}
                  onDraftChange={reviewPublish.updateDraft}
                  onConfirmPublish={handleConfirmPublish}
                />
              )}
            </>
          ) : null}
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
                      onClick={() => {
                        setSelectedFileId(file.fileId);
                        const nextThread = visibleDraftThreads.find(
                          (thread) =>
                            thread.draft.resolvedLocation.kind === 'diff' &&
                            thread.draft.resolvedLocation.fileId === file.fileId,
                        );
                        if (nextThread) {
                          setSelectedLocalThreadId(nextThread.localThreadId);
                        }
                      }}
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

            <OverviewDraftThreadSection
              threads={overviewDraftThreads}
              selectedLocalThreadId={selectedLocalThreadId}
              replyBodies={draftComposer.replyBodies}
              onSelectThread={handleSelectDraftThread}
              onReplyBodyChange={draftComposer.setReplyBody}
              onSubmitReply={handleReplyLocalThread}
              onRespondToPermission={handleRespondThreadPermission}
            />

            {overviewThreads.length > 0 ? (
              <div className="mb-4">
                <OverviewDiscussionPanel threads={overviewThreads} onReply={handleReply} />
              </div>
            ) : null}

            {selectedFile ? (
              <DiffFilePane
                key={selectedFile.fileId}
                file={selectedFile}
                remoteThreads={selectedFile.threads}
                draftThreads={selectedDraftThreads}
                selectedDraftThreadId={selectedLocalThreadId}
                draftReplyBodies={draftComposer.replyBodies}
                onAddComment={handleAddComment}
                onReply={handleReply}
                onSelectDraftThread={handleSelectDraftThread}
                onDraftReplyBodyChange={draftComposer.setReplyBody}
                onReplyToDraftThread={handleReplyLocalThread}
                onRespondDraftThreadPermission={handleRespondThreadPermission}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-slate-500">
                表示するファイルがありません。
              </div>
            )}
          </main>
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
              します。review 結果は compact panel に、thread 会話は main content に表示します。
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
