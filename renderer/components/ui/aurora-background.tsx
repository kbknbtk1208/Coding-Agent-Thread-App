import React from 'react';

import { cn } from '../../lib/cn';

type AuroraBackgroundProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function AuroraBackground({ children, className, contentClassName }: AuroraBackgroundProps) {
  return (
    <div className={cn('fey-page relative overflow-hidden text-white', className)}>
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[42rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(0,0,0,0))]" />
        <div className="absolute left-1/2 top-[-10rem] h-[34rem] w-[54rem] -translate-x-1/2 border border-white/[0.05] bg-[linear-gradient(176.83deg,rgba(19,19,19,0.5)_24.95%,rgba(12,12,12,0.22)_50.08%,rgba(3,3,3,0)_88.5%)] blur-[1px]" />
        <div className="absolute right-[-6rem] top-24 h-[30rem] w-[30rem] opacity-35">
          <div className="absolute inset-[18%] rotate-[-18deg] rounded-[38%_62%_44%_56%/46%_38%_62%_54%] border border-white/[0.08] bg-[radial-gradient(circle_at_32%_24%,rgba(255,255,255,0.28),transparent_18%),radial-gradient(circle_at_68%_72%,rgba(255,161,108,0.12),transparent_28%),linear-gradient(145deg,rgba(255,255,255,0.12),rgba(255,255,255,0.025)_38%,rgba(0,0,0,0.28)_100%)] blur-[0.4px] mix-blend-screen shadow-[inset_22px_18px_58px_rgba(255,255,255,0.07),inset_-36px_-34px_72px_rgba(0,0,0,0.48)]" />
          <div className="absolute inset-[28%] rotate-[17deg] rounded-[54%_46%_58%_42%/44%_56%_42%_58%] bg-[linear-gradient(135deg,rgba(255,255,255,0.13),rgba(255,255,255,0.025)_42%,transparent_72%)] blur-xl mix-blend-screen" />
        </div>
      </div>
      <div className={cn('relative z-10', contentClassName)}>{children}</div>
    </div>
  );
}
