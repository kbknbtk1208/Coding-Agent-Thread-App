import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../../lib/cn';

type Poc3ShimmerTextProps = ComponentPropsWithoutRef<'span'> & {
  text: string;
};

export function Poc3ShimmerText({ text, className, ...props }: Poc3ShimmerTextProps) {
  return (
    <span className={cn('text-shimmer', className)} {...props}>
      {text}
    </span>
  );
}
