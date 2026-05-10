'use client';

import { CheckCircle2, Loader2 } from 'lucide-react';

export function ResolveThreadButton({ inFlight, onClick }: { inFlight: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      disabled={inFlight}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-[5px] border border-[#4EBE96]/25 bg-[#4EBE96]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#d7f5e8] transition hover:bg-[#4EBE96]/16 disabled:cursor-default disabled:opacity-60"
    >
      {inFlight ? (
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="size-3" aria-hidden="true" />
      )}
      {inFlight ? 'Resolving' : 'Resolve'}
    </button>
  );
}

export function ResolvedBadge() {
  return (
    <span className="shrink-0 rounded-[5px] border border-[#4EBE96]/25 bg-[#4EBE96]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#d7f5e8]">
      resolved
    </span>
  );
}

export function ResolveErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-2 rounded-[6px] border border-[#ff6b6b]/20 bg-[#ff6b6b]/10 px-2 py-1.5 text-[10px] leading-4 text-[#ffd0d0]">
      {message}
    </div>
  );
}
