import React from 'react';
import { motion } from 'motion/react';

import { cn } from '../../lib/cn';

type TextEffectTag = 'h1' | 'h2' | 'p' | 'span';

type TextEffectProps = {
  text: string;
  as?: TextEffectTag;
  className?: string;
  wordClassName?: string;
  delay?: number;
};

export function TextEffect({
  text,
  as = 'span',
  className,
  wordClassName,
  delay = 0,
}: TextEffectProps) {
  const segments = React.useMemo(() => {
    const hasWhitespace = /\s/.test(text);

    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter('ja', {
        granularity: hasWhitespace ? 'word' : 'grapheme',
      });

      return Array.from(segmenter.segment(text)).map(({ segment }) => ({
        value: segment,
        isSpace: /^\s+$/.test(segment),
        needsGap: hasWhitespace && !/^\s+$/.test(segment),
      }));
    }

    if (hasWhitespace) {
      return text
        .split(/(\s+)/)
        .filter(Boolean)
        .map((segment) => ({
          value: segment,
          isSpace: /^\s+$/.test(segment),
          needsGap: !/^\s+$/.test(segment),
        }));
    }

    return Array.from(text).map((segment) => ({
      value: segment,
      isSpace: false,
      needsGap: false,
    }));
  }, [text]);
  const Component = as;

  return (
    <Component className={cn('flex flex-wrap', className)}>
      {segments.map((segment, index) =>
        segment.isSpace ? (
          <span key={`space-${index}`} className="whitespace-pre">
            {segment.value}
          </span>
        ) : (
          <motion.span
            key={`${segment.value}-${index}`}
            initial={{ opacity: 0, filter: 'blur(10px)', y: 18 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{
              duration: 0.45,
              delay: delay + index * 0.045,
              ease: 'easeOut',
            }}
            className={cn(segment.needsGap ? 'mr-[0.28em]' : '', wordClassName)}
          >
            {segment.value}
          </motion.span>
        ),
      )}
    </Component>
  );
}
