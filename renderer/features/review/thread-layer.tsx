import React, { useState } from 'react';
import type { ReviewAnchor, ReviewThread } from '../../../shared/domain/review';

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
      return 'bg-slate-500/20 text-slate-400';
    case 'range':
      return 'bg-purple-500/20 text-purple-400';
    case 'file':
      return 'bg-yellow-500/20 text-yellow-400';
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
    <div className="border-l-2 border-cyan-400/30 bg-white/[0.03] px-4 py-3">
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
                <span className="font-semibold text-cyan-300">{comment.author}</span>
                <span className="text-slate-500">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-300">{comment.body}</p>
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
                className="flex-1 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
                autoFocus
              />
              <button
                onClick={() => handleSubmitReply(thread.threadId)}
                className="rounded bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-400/30"
              >
                Send
              </button>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setReplyText('');
                }}
                className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => handleStartReply(thread.threadId)}
              className="mt-1 text-xs text-slate-500 hover:text-cyan-300"
            >
              Reply
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
