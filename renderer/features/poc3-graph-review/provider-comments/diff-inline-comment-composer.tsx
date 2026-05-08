'use client';

import { Loader2, SendHorizontal, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { Poc3DiffLineSelection } from './diff-inline-selection';

interface DiffInlineCommentComposerProps {
  selection: Poc3DiffLineSelection;
  body: string;
  inFlight: boolean;
  errorMessage: string | null;
  onBodyChange(body: string): void;
  onSubmit(body: string): void;
  onClose(): void;
}

export function DiffInlineCommentComposer({
  selection,
  body,
  inFlight,
  errorMessage,
  onBodyChange,
  onSubmit,
  onClose,
}: DiffInlineCommentComposerProps) {
  const [composing, setComposing] = useState(false);
  const textareaId = useId();
  const disabled = inFlight || body.trim().length === 0;
  const lineLabel =
    selection.startLine === selection.endLine
      ? `${selection.side} L${selection.endLine}`
      : `${selection.side} L${selection.startLine}-L${selection.endLine}`;

  return (
    <div
      data-diff-composer="true"
      className="border-l-2 border-[#d8e071]/45 bg-[#d8e071]/[0.045] px-3 py-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="rounded-full border border-[#d8e071]/25 bg-[#d8e071]/10 px-2 py-0.5 text-[10px] font-semibold text-[#f6ffc0]">
          {lineLabel}
        </span>
        <button
          type="button"
          disabled={inFlight}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-white/[0.08] bg-white/[0.03] text-white/55 transition hover:border-white/[0.16] hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onClose}
          aria-label="Close inline comment composer"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {errorMessage ? (
        <div className="mb-2 rounded-[8px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-[12px] text-[#ffd9d9]">
          {errorMessage}
        </div>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && !composing) {
            onSubmit(body);
          }
        }}
      >
        <label htmlFor={textareaId} className="sr-only">
          インラインコメント本文
        </label>
        <textarea
          id={textareaId}
          value={body}
          rows={2}
          disabled={inFlight}
          className="min-h-[46px] flex-1 resize-none rounded-[8px] border border-white/[0.1] bg-black/25 px-3 py-2 text-[12px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#d8e071]/45 focus:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="コメントを入力"
          onChange={(event) => onBodyChange(event.currentTarget.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            setComposing(false);
            onBodyChange(event.currentTarget.value);
          }}
          onBlur={(event) => onBodyChange(event.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={disabled || composing}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#d8e071]/25 bg-[#d8e071]/12 text-[#f6ffc0] transition hover:border-[#d8e071]/45 hover:bg-[#d8e071]/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d8e071]/45 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
          aria-label="Publish inline comment"
        >
          {inFlight ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <SendHorizontal className="size-4" aria-hidden="true" />
          )}
        </button>
      </form>
    </div>
  );
}
