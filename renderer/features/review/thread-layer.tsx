import React, { useState } from 'react';
import type { ReviewAnchor, ReviewThread } from '../../../shared/domain/review';
import { reviewTheme } from './review-ui';

/* ------------------------------------------------------------------ */
/*  Anchor label helpers                                               */
/* ------------------------------------------------------------------ */

function getAnchorLabel(anchor: ReviewAnchor): string {
  switch (anchor.kind) {
    case 'line': {
      const line = anchor.endLine ?? anchor.startLine ?? '?';
      return `L${line}`;
    }
    case 'range': {
      const start = anchor.startLine ?? '?';
      const end = anchor.endLine ?? '?';
      return `L${start}-L${end}`;
    }
    case 'file':
      return 'File';
  }
}

function getAnchorBadgeClass(kind: ReviewAnchor['kind']): string {
  switch (kind) {
    case 'line':
      return 'border border-[#479FFA]/20 bg-[#479FFA]/10 text-[#dcecff]';
    case 'range':
      return 'border border-[#FFA16C]/20 bg-[#FFA16C]/10 text-[#ffd9c0]';
    case 'file':
      return 'border border-[#4EBE96]/20 bg-[#4EBE96]/10 text-[#d7f5e8]';
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ThreadLayerProps {
  threads: ReviewThread[];
  onReply: (threadId: string, body: string) => void;
}

export function ThreadLayer({ threads, onReply }: ThreadLayerProps) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Early return: avoid rendering the border-l-2 wrapper when there are no threads
  if (threads.length === 0) return null;

  const handleStartReply = (threadId: string) => {
    setReplyingTo(threadId);
    setReplyText('');
  };

  const handleSubmitReply = (threadId: string) => {
    if (replyText.trim()) {
      onReply(threadId, replyText.trim());
      setReplyText('');
      setReplyingTo(null);
    }
  };

  return (
    <div className="border-l-2 border-[#479FFA]/30 bg-white/[0.03] px-4 py-3">
      {threads.map((thread) => (
        <div key={thread.threadId} className="mb-3 last:mb-0">
          <div className="mb-1 flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getAnchorBadgeClass(thread.anchor.kind)}`}
            >
              {getAnchorLabel(thread.anchor)}
            </span>
            {thread.isResolved && (
              <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] text-green-400">
                Resolved
              </span>
            )}
          </div>
          {thread.comments.map((comment) => (
            <div key={comment.commentId} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-[#479FFA]">{comment.author}</span>
                <span className="text-[#8b949e]">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[#d0d5db]">{comment.body}</p>
            </div>
          ))}

          {replyingTo === thread.threadId ? (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmitReply(thread.threadId);
                }}
                placeholder="Reply..."
                className={reviewTheme.fieldCompact + ' flex-1'}
                autoFocus
              />
              <button
                onClick={() => handleSubmitReply(thread.threadId)}
                className="rounded-[10px] border border-[#479FFA]/20 bg-[#479FFA]/10 px-3 py-1.5 text-xs font-medium text-[#dcecff] hover:bg-[#479FFA]/15"
              >
                Send
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText('');
                }}
                className={reviewTheme.secondaryButton}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleStartReply(thread.threadId)}
              className="mt-1 text-xs text-[#8b949e] hover:text-[#479FFA]"
            >
              Reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
