import React from 'react';

import { cn } from '../../lib/cn';

type ShimmerTextProps = {
  text: string;
  className?: string;
};

export function ShimmerText({ text, className }: ShimmerTextProps) {
  return <span className={cn('text-shimmer', className)}>{text}</span>;
}
