import { SplitSide } from '@git-diff-view/react';
import React, { useState } from 'react';

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
    <div className="border-l-2 border-emerald-300/50 bg-emerald-400/[0.06] px-4 py-3">
      <div className="mb-2 text-xs text-emerald-100">
        Ask agent about {lineLabel} ({sideLabel} side)
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="この範囲について質問..."
        rows={3}
        className="w-full resize-none rounded border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-300/50 focus:outline-none"
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs text-slate-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className="rounded bg-emerald-400/20 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/30 disabled:opacity-40"
        >
          Ask Agent
        </button>
      </div>
    </div>
  );
}
