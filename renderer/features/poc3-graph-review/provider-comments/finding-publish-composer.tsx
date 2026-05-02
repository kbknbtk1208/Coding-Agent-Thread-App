'use client';

import { Loader2, SendHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import type { NodeDetailSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewProviderKind } from '../../../../shared/poc3-domain/review-workspace';

export interface FindingPublishComposerProps {
  finding: NodeDetailSnapshot['findings'][number];
  detail: NodeDetailSnapshot;
  initialBody: string;
  inFlight: boolean;
  errorMessage: string | null;
  providerKind?: ReviewProviderKind;
  onSubmit(body: string): void;
  onCancel(): void;
}

export function FindingPublishComposer({
  initialBody,
  inFlight,
  errorMessage,
  providerKind,
  onSubmit,
  onCancel,
}: FindingPublishComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [composing, setComposing] = useState(false);
  const disabled = inFlight || body.trim().length === 0;

  return (
    <div className="border-t border-white/[0.08] pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#d8e071]/80">
        <SendHorizontal className="size-3" aria-hidden="true" />
        {providerKind === 'github' ? 'GitHub' : providerKind === 'gitlab' ? 'GitLab' : 'Provider'}{' '}
        にコメント投稿
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
        <textarea
          value={body}
          rows={2}
          disabled={inFlight}
          className="min-h-[46px] flex-1 resize-none rounded-[8px] border border-white/[0.1] bg-black/25 px-3 py-2 text-[12px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#d8e071]/45 focus:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="コメント文案を確認・編集して投稿してください。"
          onChange={(event) => setBody(event.currentTarget.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={(event) => {
            setComposing(false);
            setBody(event.currentTarget.value);
          }}
          onBlur={(event) => setBody(event.currentTarget.value)}
        />
        <div className="flex flex-col gap-1.5">
          <button
            type="submit"
            disabled={disabled || composing}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#d8e071]/25 bg-[#d8e071]/12 text-[#f6ffc0] transition hover:border-[#d8e071]/45 hover:bg-[#d8e071]/18 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
            aria-label="Publish finding as provider comment"
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
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-white/[0.08] bg-white/[0.03] text-white/55 transition hover:border-white/[0.16] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCancel}
            aria-label="Cancel publishing finding"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
