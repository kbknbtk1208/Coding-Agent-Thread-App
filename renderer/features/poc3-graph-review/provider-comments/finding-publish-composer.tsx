'use client';

import { Loader2, SendHorizontal, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import type { NodeDetailSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewProviderKind } from '../../../../shared/poc3-domain/review-workspace';

export interface FindingPublishComposerProps {
  finding: NodeDetailSnapshot['findings'][number];
  detail: NodeDetailSnapshot;
  initialBody: string;
  inFlight: boolean;
  errorMessage: string | null;
  providerKind?: ReviewProviderKind;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(body: string): void;
}

export function FindingPublishComposer({
  initialBody,
  inFlight,
  errorMessage,
  providerKind,
  open,
  onOpenChange,
  onSubmit,
}: FindingPublishComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [composing, setComposing] = useState(false);
  const disabled = inFlight || body.trim().length === 0;

  useEffect(() => {
    if (open) {
      setBody(initialBody);
    }
  }, [open, initialBody]);

  const providerLabel =
    providerKind === 'github' ? 'GitHub' : providerKind === 'gitlab' ? 'GitLab' : 'Provider';

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[520px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border border-white/[0.1] bg-[#131313]/92 p-5 shadow-[0_0_60px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-[16px] focus:outline-none"
        >
          <Dialog.Title className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-[#f6ffc0]">
            <SendHorizontal className="size-3.5" aria-hidden="true" />
            {providerLabel} にコメント投稿
          </Dialog.Title>

          {errorMessage ? (
            <div className="mb-3 rounded-[8px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-[12px] text-[#ffd9d9]">
              {errorMessage}
            </div>
          ) : null}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!disabled && !composing) {
                onSubmit(body);
              }
            }}
          >
            <textarea
              value={body}
              rows={15}
              disabled={inFlight}
              className="w-full resize-none rounded-[8px] border border-white/[0.1] bg-black/25 px-3 py-2.5 text-[13px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#d8e071]/45 focus:bg-black/35 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="コメント文案を確認・編集して投稿してください。"
              onChange={(event) => setBody(event.currentTarget.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => {
                setComposing(false);
                setBody(event.currentTarget.value);
              }}
              onBlur={(event) => setBody(event.currentTarget.value)}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={inFlight}
                  className="flex cursor-pointer items-center rounded-[7px] border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/55 transition hover:border-white/[0.16] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  キャンセル
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={disabled || composing}
                className="flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-[#d8e071]/25 bg-[#d8e071]/12 px-3 py-1.5 text-[12px] font-semibold text-[#f6ffc0] transition hover:border-[#d8e071]/45 hover:bg-[#d8e071]/18 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
              >
                {inFlight ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <SendHorizontal className="size-3.5" aria-hidden="true" />
                )}
                投稿
              </button>
            </div>
          </form>

          <Dialog.Close asChild>
            <button
              type="button"
              disabled={inFlight}
              className="absolute right-3 top-3 flex size-7 cursor-pointer items-center justify-center rounded-[6px] text-white/40 transition hover:bg-white/[0.08] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="ダイアログを閉じる"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
