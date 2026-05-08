'use client';

import { Loader2, MessageSquareReply, SendHorizontal, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import type { NodeDetailSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';

export interface RemoteThreadReplyComposerProps {
  thread: NodeDetailSnapshot['threads']['remote'][number];
  inFlight: boolean;
  published: boolean;
  errorMessage: string | null;
  onSubmit(body: string): void;
  onDraftChange?(body: string): void;
  initialDraft?: string;
}

export function RemoteThreadReplyComposer({
  thread: _thread,
  inFlight,
  published,
  errorMessage,
  onSubmit,
  onDraftChange,
  initialDraft = '',
}: RemoteThreadReplyComposerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [body, setBody] = useState(initialDraft);
  const [composing, setComposing] = useState(false);
  const textareaId = useId();
  const disabled = inFlight || body.trim().length === 0;

  useEffect(() => {
    if (published) {
      setIsOpen(false);
      setBody('');
    }
  }, [published]);

  if (!isOpen) {
    return (
      <div className="mt-2 border-t border-[#58d7ff]/10 pt-2">
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-[#58d7ff]/20 bg-[#58d7ff]/[0.07] px-2.5 py-1 text-[10px] font-semibold text-[#dff7ff]/70 transition hover:border-[#58d7ff]/40 hover:bg-[#58d7ff]/14 hover:text-[#dff7ff] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#58d7ff]/45"
          onClick={() => setIsOpen(true)}
          aria-label="Reply to this comment thread"
        >
          <MessageSquareReply className="size-3" aria-hidden="true" />
          Reply
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 border-t border-[#58d7ff]/10 pt-2">
      {errorMessage ? (
        <div className="mb-2 rounded-[8px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-[11px] text-[#ffd9d9]">
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
          スレッドへの返信
        </label>
        <textarea
          id={textareaId}
          autoFocus
          value={body}
          rows={2}
          disabled={inFlight}
          className="min-h-[46px] flex-1 resize-none rounded-[8px] border border-[#58d7ff]/20 bg-black/25 px-3 py-2 text-[12px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#58d7ff]/45 focus:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="返信内容を入力してください..."
          onChange={(event) => {
            setBody(event.currentTarget.value);
            onDraftChange?.(event.currentTarget.value);
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            setComposing(false);
            setBody(event.currentTarget.value);
            onDraftChange?.(event.currentTarget.value);
          }}
          onBlur={(event) => setBody(event.currentTarget.value)}
        />
        <div className="flex flex-col gap-1.5">
          <button
            type="submit"
            disabled={disabled || composing}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#58d7ff]/25 bg-[#58d7ff]/12 text-[#dff7ff] transition hover:border-[#58d7ff]/45 hover:bg-[#58d7ff]/18 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#58d7ff]/45 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
            aria-label="Submit reply"
          >
            {inFlight ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal className="size-4" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            disabled={inFlight}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white/55 transition hover:border-white/[0.16] hover:text-white/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => setIsOpen(false)}
            aria-label="Cancel reply"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
