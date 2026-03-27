import React from 'react';
import { motion } from 'motion/react';

import { cn } from '../../lib/cn';

type TextEffectTag = 'h1' | 'h2' | 'p' | 'span';
type TextEffectLayout = 'flow' | 'wrap';

type TextEffectProps = {
  text: string;
  as?: TextEffectTag;
  className?: string;
  wordClassName?: string;
  delay?: number;
  segmentDelay?: number;
  layout?: TextEffectLayout;
  preserveWhitespace?: boolean;
  staggerWindow?: number;
};

export function TextEffect({
  text,
  as = 'span',
  className,
  wordClassName,
  delay = 0,
  segmentDelay = 0.045,
  layout = 'wrap',
  preserveWhitespace = false,
  staggerWindow,
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
  const staggerStartIndex =
    typeof staggerWindow === 'number' && Number.isFinite(staggerWindow)
      ? Math.max(0, segments.length - Math.max(0, Math.floor(staggerWindow)))
      : 0;
  const layoutClass = layout === 'wrap' ? 'flex flex-wrap' : as === 'span' ? 'inline' : 'block';
  const whitespaceClass = preserveWhitespace ? 'whitespace-pre-wrap' : '';

  return (
    <Component className={cn(layoutClass, whitespaceClass, className)}>
      {segments.map((segment, index) =>
        segment.isSpace ? (
          <span
            key={`space-${index}`}
            className={preserveWhitespace ? 'whitespace-pre-wrap' : 'whitespace-pre'}
          >
            {segment.value}
          </span>
        ) : (
          <motion.span
            key={`${segment.value}-${index}`}
            initial={{ opacity: 0, filter: 'blur(10px)', y: 18 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{
              duration: 0.45,
              delay:
                delay +
                (typeof staggerWindow === 'number' && Number.isFinite(staggerWindow)
                  ? Math.max(0, index - staggerStartIndex)
                  : index) *
                  segmentDelay,
              ease: 'easeOut',
            }}
            className={cn(whitespaceClass, segment.needsGap ? 'mr-[0.28em]' : '', wordClassName)}
          >
            {segment.value}
          </motion.span>
        ),
      )}
    </Component>
  );
}
