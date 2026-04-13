'use client';

import * as React from 'react';
import { AnimatePresence, motion, Transition, Variants } from 'motion/react';

import { cn } from '@/lib/utils';

export type MorphingTextProps = {
  children: string;
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  variants?: Variants;
  transition?: Transition;
};

export default function MorphingText({
  children,
  as: Component = 'span',
  className,
  style,
  variants,
  transition,
}: MorphingTextProps) {
  const uniqueId = React.useId();

  const characters = React.useMemo(() => {
    const charCounts: Record<string, number> = {};

    return children.split('').map((char) => {
      const lowerChar = char.toLowerCase();
      charCounts[lowerChar] = (charCounts[lowerChar] || 0) + 1;

      return {
        id: `${uniqueId}-${lowerChar}${charCounts[lowerChar]}`,
        label: char === ' ' ? '\u00A0' : char,
      };
    });
  }, [children, uniqueId]);

  const defaultVariants: Variants = {
    initial: { opacity: 0, y: -20, filter: 'blur(8px)', scale: 0.8 },
    animate: { opacity: 1, y: 0, filter: 'blur(0px)', scale: 1 },
    exit: { opacity: 0, y: 20, filter: 'blur(8px)', scale: 0.8 },
  };

  const defaultTransition: Transition = {
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1],
  };

  return (
    <Component className={cn(className)} aria-label={children} style={style}>
      <AnimatePresence mode="popLayout" initial={false}>
        {characters.map((character) => (
          <motion.span
            key={character.id}
            layoutId={character.id}
            className="inline-block"
            aria-hidden="true"
            initial="initial"
            animate="animate"
            exit="exit"
            variants={variants || defaultVariants}
            transition={transition || defaultTransition}
          >
            {character.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </Component>
  );
}
