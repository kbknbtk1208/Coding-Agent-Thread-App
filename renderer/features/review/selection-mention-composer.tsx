import { SplitSide } from '@git-diff-view/react';
import React, { useState } from 'react';
import { reviewTheme } from './review-ui';

interface SelectionMentionComposerProps {
  startLine: number;
  endLine: number;
  side: SplitSide;
  disabled?: boolean;
  onSubmit: (body: string) => void;
  onClose: () => void;
}

export function SelectionMentionComposer({
  startLine,
  endLine,
  side,
  disabled = false,
  onSubmit,
  onClose,
}: SelectionMentionComposerProps) {
  const [text, setText] = useState('');
  const sideLabel = side === SplitSide.old ? 'old' : 'new';
  const lineLabel = startLine === endLine ? `line ${endLine}` : `lines ${startLine}-${endLine}`;

  const handleSubmit = () => {
    const body = text.trim();
    if (!body || disabled) {
      return;
    }
    onSubmit(body);
    setText('');
  };

  return (
    <div className="border-l-2 border-[#4EBE96]/50 bg-[#4EBE96]/[0.06] px-4 py-3">
      <div className="mb-2 text-xs text-[#d7f5e8]">
        Ask agent about {lineLabel} ({sideLabel} side)
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="この範囲について質問..."
        rows={3}
        className={reviewTheme.textarea}
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-[8px] px-3 py-1.5 text-xs text-[#8b949e] hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className="rounded-[10px] border border-[#4EBE96]/20 bg-[#4EBE96]/10 px-3 py-1.5 text-xs font-medium text-[#d7f5e8] hover:bg-[#4EBE96]/15 disabled:opacity-40"
        >
          Ask Agent
        </button>
      </div>
    </div>
  );
}
