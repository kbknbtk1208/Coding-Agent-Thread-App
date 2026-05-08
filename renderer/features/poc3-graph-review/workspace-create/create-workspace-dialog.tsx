'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { GitPullRequest, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ResolveReviewWorkspaceTargetResult } from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceCreationJobSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';
import { useDialogExitTransition } from '../repository-settings/use-dialog-exit-transition';
import { useDialogA11y } from '../components/use-dialog-a11y';

export const CREATE_WORKSPACE_LAYOUT_ID = 'poc3-create-workspace-surface';

interface CreateWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  onStarted: (job: ReviewWorkspaceCreationJobSnapshot) => void;
}

export function CreateWorkspaceDialog({ open, onClose, onStarted }: CreateWorkspaceDialogProps) {
  const { rendered, closing } = useDialogExitTransition(open);
  const [reviewUrl, setReviewUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<ResolveReviewWorkspaceTargetResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (rendered || closing) {
      return;
    }
    setReviewUrl('');
    setResolution(null);
    setResolving(false);
    setSubmitting(false);
    setError(null);
  }, [rendered, closing]);

  const { backdropProps } = useDialogA11y({
    rendered,
    closing,
    onClose,
    initialFocusRef: urlInputRef,
  });

  useEffect(() => {
    if (!open) {
      setResolution(null);
      setResolving(false);
      return;
    }
    let canceled = false;
    setResolution(null);
    setResolving(false);
    if (!reviewUrl.trim()) {
      return;
    }
    const handle = window.setTimeout(async () => {
      setResolving(true);
      setError(null);
      try {
        const result = await window.poc3GraphReviewApi.resolveReviewWorkspaceTarget({
          reviewUrl,
        });
        if (canceled) {
          return;
        }
        setResolution(result);
      } catch (err) {
        if (canceled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Review URL を解決できませんでした。');
        setResolution(null);
      } finally {
        if (!canceled) {
          setResolving(false);
        }
      }
    }, 450);
    return () => {
      canceled = true;
      window.clearTimeout(handle);
    };
  }, [open, reviewUrl]);

  const target = resolution?.target ?? null;
  const canCreate = Boolean(target) && !submitting && !resolving;

  const handleCreate = async () => {
    if (!target) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await window.poc3GraphReviewApi.createReviewWorkspace({
        reviewUrl: target.reviewUrl,
        repositoryProfileId: target.repositoryProfileId,
      });
      onStarted(response.job);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace 作成を開始できませんでした。');
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {rendered ? (
        <motion.div
          key="poc3-create-workspace-layer"
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          <motion.div
            className="absolute inset-0 bg-black/24 backdrop-blur-[6px]"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={
              closing
                ? { opacity: 0, backdropFilter: 'blur(10px)' }
                : { opacity: 1, backdropFilter: 'blur(6px)' }
            }
            transition={{ duration: 0.34, ease: [0.4, 0, 0.2, 1] }}
          />
          <motion.div
            key="poc3-create-workspace-shell"
            className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8"
            {...backdropProps}
          >
            <motion.div
              layoutId={CREATE_WORKSPACE_LAYOUT_ID}
              className="w-[min(96vw,560px)] rounded-2xl bg-[linear-gradient(210deg,rgba(255,255,255,0.22)_6.2%,rgba(20,20,20,0.5)_21.56%,rgba(50,50,50,0.5)_69.03%,rgba(255,255,255,0.4)_96.99%)] p-px shadow-[0_0_44px_rgba(0,0,0,0.8)]"
              initial={false}
              animate={
                closing
                  ? { opacity: 0, scale: 0.985, filter: 'blur(64px)' }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)' }
              }
              transition={{ duration: 0.34, ease: [0.4, 0, 0.2, 1] }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="poc3-create-workspace-title"
                className="rounded-2xl bg-[#131313]/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-34px_70px_rgba(0,0,0,0.2)] backdrop-blur-[16px]"
              >
                <div className="flex items-start justify-between gap-4 px-5 py-4">
                  <div>
                    <h2
                      id="poc3-create-workspace-title"
                      className="text-xl font-semibold text-white"
                    >
                      Create Review Workspace
                    </h2>
                    <p className="mt-1 text-xs text-[#8e98a4]">
                      PR / MR URL から Review Workspace を作成します。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-white/[0.12] bg-white/[0.06] p-2 text-white transition hover:bg-white/[0.1]"
                    aria-label="Close create workspace dialog"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div className="space-y-4 px-5 pb-5">
                  <div>
                    <label
                      htmlFor="poc3-create-workspace-url"
                      className="text-xs font-medium text-[#8e98a4]"
                    >
                      PR / MR URL
                    </label>
                    <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/[0.12] bg-black/30 px-3 focus-within:border-[#d8e071]/45">
                      <GitPullRequest className="h-4 w-4 text-[#a8b0b8]" aria-hidden="true" />
                      <input
                        ref={urlInputRef}
                        id="poc3-create-workspace-url"
                        value={reviewUrl}
                        onChange={(event) => setReviewUrl(event.target.value)}
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#68717b]"
                        placeholder="https://github.com/owner/repo/pull/123"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  <ResolutionPreview
                    resolving={resolving}
                    resolution={resolution}
                    reviewUrl={reviewUrl}
                  />

                  {error ? (
                    <p className="rounded-lg border border-[#ff5c5c]/25 bg-[#ff5c5c]/10 px-3 py-2 text-sm text-[#ffd1d1]">
                      {error}
                    </p>
                  ) : null}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-[#479ffa]/35"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!canCreate}
                      onClick={() => {
                        void handleCreate();
                      }}
                      className="flex items-center gap-2 rounded-lg bg-[#d8e071] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:opacity-50"
                    >
                      <Play className="h-4 w-4" aria-hidden="true" />
                      Create Workspace
                    </button>
                  </div>
                </div>
              </section>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ResolutionPreview({
  resolving,
  resolution,
  reviewUrl,
}: {
  resolving: boolean;
  resolution: ResolveReviewWorkspaceTargetResult | null;
  reviewUrl: string;
}) {
  if (!reviewUrl.trim()) {
    return (
      <div className="rounded-lg border border-dashed border-white/[0.14] bg-white/[0.025] px-4 py-3 text-sm text-[#8e98a4]">
        URL を入力すると、登録済み Repository Profile を自動解決します。
      </div>
    );
  }
  if (resolving) {
    return (
      <div className="rounded-lg border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-sm text-[#a8b0b8]">
        Repository Profile を解決中...
      </div>
    );
  }
  if (!resolution) {
    return null;
  }
  if (!resolution.ok || !resolution.target) {
    return (
      <div className="rounded-lg border border-[#ff5c5c]/25 bg-[#ff5c5c]/10 px-4 py-3 text-sm text-[#ffd1d1]">
        {resolution.message ?? 'Review URL を解決できません。'}
      </div>
    );
  }

  const target = resolution.target;
  return (
    <div className="space-y-2 rounded-lg border border-[#d8e071]/25 bg-[#d8e071]/10 px-4 py-3 text-sm">
      <PreviewRow label="Repository">
        <span className="font-medium text-white">{target.repositoryLabel}</span>
        <span className="ml-2 text-xs text-[#a8b0b8]">({target.provider})</span>
      </PreviewRow>
      <PreviewRow label="Worktree root">
        <span className="break-all text-[#e6e6e6]">{target.worktreeRootPath}</span>
      </PreviewRow>
      <PreviewRow label="Local clone">
        <span className="break-all text-[#e6e6e6]">{target.localClonePath}</span>
      </PreviewRow>
      <PreviewRow label="Setup script">
        {target.setupScript && target.setupScript.scriptText.trim() ? (
          <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap rounded bg-black/40 px-2 py-1 text-xs text-[#e6e6e6]">
            {target.setupScript.scriptText}
          </pre>
        ) : (
          <span className="text-xs text-[#a8b0b8]">未設定（スキップされます）</span>
        )}
      </PreviewRow>
    </div>
  );
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#cfd78a]">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-[#e6e6e6]">{children}</div>
    </div>
  );
}
