import React, { useState } from 'react';
import { SplitSide } from '@git-diff-view/react';
import { reviewTheme } from './review-ui';

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
    <div className="border-l-2 border-[#479FFA]/50 bg-white/[0.03] px-4 py-3">
      <div className="mb-2 text-xs text-[#8b949e]">
        {isRange
          ? `Comment on lines ${startLine}-${endLine} (${sideLabel} side)`
          : `Comment on line ${endLine} (${sideLabel} side)`}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className={reviewTheme.textarea}
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-[8px] px-3 py-1.5 text-xs text-[#8b949e] hover:text-white"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="rounded-[10px] border border-[#479FFA]/20 bg-[#479FFA]/10 px-3 py-1.5 text-xs font-medium text-[#dcecff] hover:bg-[#479FFA]/15 disabled:opacity-40"
        >
          Add Comment
        </button>
      </div>
    </div>
  );
}
