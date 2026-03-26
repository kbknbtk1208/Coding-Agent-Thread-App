import React from 'react';

import { cn } from '../../lib/cn';

type AuroraBackgroundProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AuroraBackground({ children, className, contentClassName }: AuroraBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden bg-[#061318] text-white', className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(111,255,233,0.18),transparent_38%),radial-gradient(circle_at_80%_15%,rgba(244,114,182,0.16),transparent_28%),linear-gradient(180deg,#081116_0%,#061318_35%,#04070a_100%)]" />
        <div className="aurora-ribbon absolute -left-1/4 top-[-18%] h-[32rem] w-[62rem] rounded-full bg-[radial-gradient(circle,rgba(112,255,228,0.4)_0%,rgba(112,255,228,0.08)_34%,transparent_66%)] blur-3xl" />
        <div className="aurora-ribbon aurora-ribbon-delay absolute right-[-20%] top-[14%] h-[28rem] w-[54rem] rounded-full bg-[radial-gradient(circle,rgba(96,165,250,0.3)_0%,rgba(96,165,250,0.08)_34%,transparent_68%)] blur-3xl" />
        <div className="aurora-ribbon aurora-ribbon-slow absolute bottom-[-16%] left-[8%] h-[28rem] w-[48rem] rounded-full bg-[radial-gradient(circle,rgba(244,114,182,0.22)_0%,rgba(244,114,182,0.06)_42%,transparent_70%)] blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:120px_120px] opacity-[0.10]" />
      </div>
      <div className={cn('relative z-10', contentClassName)}>{children}</div>
    </div>
  );
}
