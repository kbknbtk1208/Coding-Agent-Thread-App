import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { ReviewProvider } from '../../../shared/domain/review';
import { SplitSide } from '@git-diff-view/react';
import { DiffFilePane } from './diff-file-pane';
import { useReviewData } from './use-review-data';
import { useReviewState } from './use-review-state';

export function ReviewPage() {
  const router = useRouter();
  const [provider, setProvider] = useState<ReviewProvider>('github');
  const [selectedFileIndex, setSelectedFileIndex] = useState<number | null>(null);
  const { data, loading, error } = useReviewData(provider);
  const reviewState = useReviewState();

  useEffect(() => {
    if (data) {
      reviewState.reset(data);
    }
    // Only reset when data reference changes (after fetch)
  }, [data, reviewState.reset]);

  const handleProviderSwitch = (next: ReviewProvider) => {
    setProvider(next);
    setSelectedFileIndex(null);
  };

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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-slate-400">Loading review data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-red-400">Error: {error}</div>
      </div>
    );
  }

  if (!data) return null;

  const currentFiles = reviewState.data.files;
  const visibleFiles =
    selectedFileIndex !== null && selectedFileIndex < currentFiles.length
      ? [currentFiles[selectedFileIndex]]
      : currentFiles;

  return (
    <div className="flex h-screen flex-col text-white">
      {/* Top bar */}
      <header className="flex items-center gap-4 border-b border-white/10 bg-white/[0.02] px-5 py-3">
        <button
          onClick={() => {
            void router.push('/home');
          }}
          className="text-sm text-slate-400 hover:text-white"
        >
          ← Home
        </button>
        <div className="h-4 w-px bg-white/10" />
        <h1 className="text-sm font-semibold">{reviewState.data.title}</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">Provider:</span>
          <button
            onClick={() => handleProviderSwitch('github')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'github'
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            GitHub
          </button>
          <button
            onClick={() => handleProviderSwitch('gitlab')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              provider === 'gitlab'
                ? 'bg-cyan-400/20 text-cyan-300'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            GitLab
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File list sidebar */}
        <aside className="w-[280px] flex-shrink-0 overflow-y-auto border-r border-white/10 bg-white/[0.01]">
          <div className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Files ({currentFiles.length})
            </div>
            <button
              onClick={() => setSelectedFileIndex(null)}
              className={`mb-1 w-full rounded px-2 py-1.5 text-left text-xs transition ${
                selectedFileIndex === null
                  ? 'bg-cyan-400/10 text-cyan-300'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              All files
            </button>
            {currentFiles.map((file, i) => (
              <button
                key={file.fileId}
                onClick={() => setSelectedFileIndex(i)}
                className={`mb-0.5 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                  selectedFileIndex === i
                    ? 'bg-cyan-400/10 text-cyan-300'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span className="flex-1 truncate">{file.filePath.split('/').pop()}</span>
                <span className="flex items-center gap-1 text-[10px]">
                  <span className="text-green-400">+{file.additions}</span>
                  <span className="text-red-400">-{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main content — §4.8 scroll-jitter prevention:
            overflow-anchor: auto enables browser-native scroll anchoring so
            that DOM mutations (new thread rows, hunk expansion) below or above
            the viewport do not shift the visible content.
            scroll-behavior: auto prevents smooth scrolling which would fight
            the anchor restoration logic. */}
        <main
          className="flex-1 overflow-y-auto p-4"
          style={{ overflowAnchor: 'auto', scrollBehavior: 'auto' }}
        >
          <div className="mb-4">
            <p className="text-sm text-slate-400">{reviewState.data.description}</p>
          </div>
          {visibleFiles.map((file) =>
            file ? (
              <DiffFilePane
                key={file.fileId}
                file={file}
                onAddComment={handleAddComment}
                onReply={handleReply}
              />
            ) : null,
          )}
        </main>
      </div>
    </div>
  );
}
