'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';

export function LoadingState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] border border-[#d8e071]/28 bg-[#d8e071]/10 px-4 py-3 text-[12px] text-[#f6ffc0]">
      <Loader2 className="size-4 shrink-0 animate-spin text-[#d8e071]" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[#ffbf6b]/35 bg-[#ffbf6b]/10 px-4 py-3 text-[12px] text-[#ffd79a]">
      <AlertTriangle className="size-4 shrink-0 text-[#ffbf6b]" aria-hidden="true" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}

export function InlineNotice({ tone, message }: { tone: 'loading' | 'error'; message: string }) {
  if (tone === 'loading') {
    return <LoadingState message={message} />;
  }
  return <ErrorState message={message} />;
}
