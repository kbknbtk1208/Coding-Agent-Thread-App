'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '../../../lib/cn';

type Poc3MorphingShimmerTextProps = ComponentPropsWithoutRef<'span'> & {
  text: string;
};

export function Poc3MorphingShimmerText({
  text,
  className,
  ...props
}: Poc3MorphingShimmerTextProps) {
  return (
    <span className={cn('relative block overflow-hidden', className)} aria-label={text} {...props}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={text}
          className="text-shimmer block truncate whitespace-nowrap"
          aria-hidden="true"
          initial={{ opacity: 0, y: -8, filter: 'blur(7px)', scale: 0.98 }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 }}
          exit={{ opacity: 0, y: 8, filter: 'blur(7px)', scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
