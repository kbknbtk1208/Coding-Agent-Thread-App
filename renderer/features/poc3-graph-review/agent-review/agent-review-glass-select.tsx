'use client';

import { ChevronDown } from 'lucide-react';

export interface AgentReviewGlassSelectProps {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}

export function AgentReviewGlassSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  children,
}: AgentReviewGlassSelectProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={ariaLabel}
        className="h-8 w-full appearance-none rounded-[7px] border border-white/[0.08] bg-white/[0.035] px-2 pr-7 text-[11px] font-medium text-white/70 outline-none backdrop-blur-[18px] transition focus:border-[#58d7ff]/28 focus:shadow-[0_0_0_2px_rgba(88,215,255,0.07)] disabled:opacity-50"
        style={{ WebkitAppearance: 'none' }}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-white/38"
        aria-hidden="true"
      />
    </div>
  );
}
