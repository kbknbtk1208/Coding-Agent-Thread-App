import React, { useMemo, useState } from 'react';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';

interface OverviewDiscussionPanelProps {
  threads: ReviewSnapshotThread[];
  onReply: (threadId: string, body: string) => void;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OverviewDiscussionPanel({ threads, onReply }: OverviewDiscussionPanelProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const sortedThreads = useMemo(
    () =>
      [...threads].sort((left, right) => {
        const leftTimestamp = left.comments[0]?.createdAt ?? '';
        const rightTimestamp = right.comments[0]?.createdAt ?? '';
        return leftTimestamp.localeCompare(rightTimestamp);
      }),
    [threads],
  );

  const handleReplySubmit = (threadId: string) => {
    const nextBody = replyText.trim();
    if (!nextBody) {
      return;
    }

    onReply(threadId, nextBody);
    setReplyingTo(null);
    setReplyText('');
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Overview Discussion</h2>
            <p className="mt-1 text-xs text-slate-500">
              diff にアンカーされていないコメントを表示します。
            </p>
          </div>
          <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
            {sortedThreads.length} threads
          </span>
        </div>
      </div>

      <div className="px-4 py-4">
        {sortedThreads.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-slate-500">
            overview discussion はまだありません。
          </div>
        ) : (
          <div className="space-y-3">
            {sortedThreads.map((thread) => (
              <section
                key={thread.threadId}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                    Overview
                  </span>
                  {thread.isResolved ? (
                    <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] text-green-300">
                      Resolved
                    </span>
                  ) : null}
                  {thread.isOutdated ? (
                    <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] text-slate-300">
                      Outdated
                    </span>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {thread.comments.map((comment) => (
                    <article key={comment.commentId} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-cyan-300">{comment.author}</span>
                        <span className="text-slate-500">{formatTimestamp(comment.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-300">
                        {comment.body}
                      </p>
                    </article>
                  ))}
                </div>

                {replyingTo === thread.threadId ? (
                  <div className="mt-4 grid gap-2">
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      rows={3}
                      placeholder="返信を書く..."
                      className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-none"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText('');
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplySubmit(thread.threadId)}
                        disabled={!replyText.trim()}
                        className="rounded-lg bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-400/30 disabled:opacity-40"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(thread.threadId);
                      setReplyText('');
                    }}
                    className="mt-4 text-xs text-slate-500 hover:text-cyan-300"
                  >
                    Reply
                  </button>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
