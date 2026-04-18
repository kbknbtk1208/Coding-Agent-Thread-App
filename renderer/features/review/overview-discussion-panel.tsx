import React, { useMemo, useState } from 'react';
import type { ReviewSnapshotThread } from '../../../shared/domain/review';
import { reviewTheme } from './review-ui';

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
    <section className={`${reviewTheme.surface} overflow-hidden`}>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className={reviewTheme.title}>Overview Discussion</h2>
            <p className="mt-1 text-xs text-[#8b949e]">
              diff にアンカーされていないコメントを表示します。
            </p>
          </div>
          <span className={reviewTheme.pillInfo}>{sortedThreads.length} threads</span>
        </div>
      </div>

      <div className="px-4 py-4">
        {sortedThreads.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-sm text-[#8b949e]">
            overview discussion はまだありません。
          </div>
        ) : (
          <div className="space-y-3">
            {sortedThreads.map((thread) => (
              <section
                key={thread.threadId}
                className="rounded-[12px] border border-white/10 bg-white/[0.03] p-4"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={reviewTheme.chipAccent}>Overview</span>
                  {thread.isResolved ? (
                    <span className={reviewTheme.chipSuccess}>Resolved</span>
                  ) : null}
                  {thread.isOutdated ? <span className={reviewTheme.chip}>Outdated</span> : null}
                </div>

                <div className="space-y-3">
                  {thread.comments.map((comment) => (
                    <article key={comment.commentId} className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-[#479FFA]">{comment.author}</span>
                        <span className="text-[#8b949e]">{formatTimestamp(comment.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[#d0d5db]">
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
                      className={reviewTheme.textarea}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyText('');
                        }}
                        className={reviewTheme.secondaryButton}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReplySubmit(thread.threadId)}
                        disabled={!replyText.trim()}
                        className="rounded-[10px] border border-[#479FFA]/20 bg-[#479FFA]/10 px-3 py-1.5 text-xs font-medium text-[#dcecff] hover:bg-[#479FFA]/15 disabled:opacity-40"
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
                    className="mt-4 text-xs text-[#8b949e] hover:text-[#479FFA]"
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
