'use client';

import { Loader2, SendHorizontal } from 'lucide-react';
import { useState } from 'react';

export function ThreadErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-[8px] border border-[#FF5C5C]/20 bg-[#FF5C5C]/10 px-3 py-2 text-[12px] leading-5 text-[#ffd9d9]">
      {message}
    </div>
  );
}

export function ThreadReplyComposer({
  body,
  replyStatus,
  onChange,
  onSubmit,
}: {
  body: string;
  replyStatus: 'idle' | 'replying' | 'failed';
  onChange(body: string): void;
  onSubmit(): void;
}) {
  const [composing, setComposing] = useState(false);
  const disabled = replyStatus === 'replying' || body.trim().length === 0;
  return (
    <form
      className="mt-3 flex items-end gap-2 border-t border-white/[0.08] pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !composing) {
          onSubmit();
        }
      }}
    >
      <textarea
        value={body}
        rows={2}
        className="min-h-[46px] flex-1 resize-none rounded-[8px] border border-white/[0.1] bg-black/25 px-3 py-2 text-[12px] leading-5 text-white outline-none transition placeholder:text-white/28 focus:border-[#479FFA]/45 focus:bg-black/35"
        placeholder="この finding についての追加質問や確認事項を入力してください。"
        onChange={(event) => onChange(event.currentTarget.value)}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(event) => {
          setComposing(false);
          onChange(event.currentTarget.value);
        }}
        onBlur={(event) => onChange(event.currentTarget.value)}
      />
      <button
        type="submit"
        disabled={disabled || composing}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-[#479FFA]/25 bg-[#479FFA]/12 text-[#d7eaff] transition hover:border-[#479FFA]/45 hover:bg-[#479FFA]/18 disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-white/25"
        aria-label="Send finding thread reply"
      >
        {replyStatus === 'replying' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <SendHorizontal className="size-4" aria-hidden="true" />
        )}
      </button>
    </form>
  );
}
