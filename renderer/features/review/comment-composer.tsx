import React, { useState } from 'react';
import { SplitSide } from '@git-diff-view/react';

interface CommentComposerProps {
  startLine: number | null;
  endLine: number;
  side: SplitSide;
  onSubmit: (body: string) => void;
  onClose: () => void;
}

export function CommentComposer({
  startLine,
  endLine,
  side,
  onSubmit,
  onClose,
}: CommentComposerProps) {
  const [text, setText] = useState('');
  const sideLabel = side === SplitSide.old ? 'old' : 'new';
  const isRange = startLine !== null && startLine !== endLine;

  /**
   * Fix #10: Do not call onClose() after onSubmit().
   * The close responsibility is delegated to the onSubmit callback,
   * which typically calls setRangeSelection(null) or equivalent.
   * Calling onClose() here would cause a redundant state update.
   */
  const handleSubmit = () => {
    if (text.trim()) {
      onSubmit(text.trim());
      setText('');
    }
  };

  return (
    <div className="border-l-2 border-cyan-400/50 bg-white/[0.03] px-4 py-3">
      <div className="mb-2 text-xs text-slate-500">
        {isRange
          ? `Comment on lines ${startLine}-${endLine} (${sideLabel} side)`
          : `Comment on line ${endLine} (${sideLabel} side)`}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="w-full resize-none rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400/50 focus:outline-none"
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="rounded bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-400/30 disabled:opacity-40"
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
