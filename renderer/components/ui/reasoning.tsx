import React from 'react';

import { cn } from '../../lib/cn';

type ReasoningProps = {
  children: React.ReactNode;
  contentClassName?: string;
  isActive?: boolean;
  className?: string;
};

export function Reasoning({
  children,
  contentClassName,
  isActive = false,
  className,
}: ReasoningProps) {
  return (
    <div className={cn('flex gap-3 py-1', className)}>
      <div className="relative mt-[0.6em] flex-shrink-0">
        <div className={cn('h-1.5 w-1.5 rounded-full', isActive ? 'bg-cyan-400' : 'bg-white/20')} />
        {isActive ? (
          <div className="absolute inset-0 h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400/60" />
        ) : null}
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 text-sm leading-7',
          isActive ? 'text-slate-200' : 'text-slate-400',
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
