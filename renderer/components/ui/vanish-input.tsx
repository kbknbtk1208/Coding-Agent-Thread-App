import React from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../../lib/cn';

type VanishInputProps = {
  placeholders: string[];
  onSubmit?: (value: string) => void;
  className?: string;
};

export function VanishInput({ placeholders, onSubmit, className }: VanishInputProps) {
  const [value, setValue] = React.useState('');
  const [placeholderIndex, setPlaceholderIndex] = React.useState(0);
  const [vanishingText, setVanishingText] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timerId = window.setInterval(() => {
      setPlaceholderIndex((current) => (current + 1) % placeholders.length);
    }, 2400);

    return () => window.clearInterval(timerId);
  }, [placeholders.length]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const nextValue = value.trim();

      if (!nextValue) {
        return;
      }

      setVanishingText(nextValue);
      onSubmit?.(nextValue);

      window.setTimeout(() => {
        setVanishingText(null);
      }, 720);

      setValue('');
    },
    [onSubmit, value],
  );

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'glass-panel flex flex-col gap-3 rounded-[1.8rem] p-3 sm:flex-row sm:items-center',
        className,
      )}
    >
      <div className="relative min-h-[3.5rem] flex-1 overflow-hidden rounded-[1.35rem] border border-white/10 bg-black/35 px-5 py-3">
        <AnimatePresence mode="wait">
          {!value && !vanishingText ? (
            <motion.span
              key={placeholders[placeholderIndex]}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-sm text-slate-400"
            >
              {placeholders[placeholderIndex]}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={cn(
            'relative z-10 w-full bg-transparent text-base text-white outline-none placeholder:text-transparent',
            vanishingText ? 'opacity-0' : 'opacity-100',
          )}
          aria-label="Agent prompt"
        />

        <AnimatePresence>
          {vanishingText ? (
            <motion.div
              key={vanishingText}
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.72, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-y-0 left-5 flex items-center pr-6 text-base text-cyan-100"
            >
              {vanishingText.split('').map((character, index) => (
                <motion.span
                  key={`${character}-${index}`}
                  initial={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  animate={{
                    opacity: 0,
                    y: -18 - index * 0.4,
                    filter: 'blur(6px)',
                  }}
                  transition={{
                    duration: 0.4,
                    delay: index * 0.018,
                    ease: 'easeOut',
                  }}
                  className="inline-block"
                >
                  {character === ' ' ? '\u00A0' : character}
                </motion.span>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <button
        type="submit"
        className="inline-flex h-14 items-center justify-center rounded-[1.35rem] bg-[linear-gradient(135deg,#67e8f9_0%,#f9a8d4_48%,#fde68a_100%)] px-6 text-sm font-semibold text-slate-950 transition-transform duration-200 hover:scale-[1.01]"
      >
        スレッドを開始
      </button>
    </form>
  );
}
