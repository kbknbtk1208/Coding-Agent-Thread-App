import React from 'react';
import { motion } from 'motion/react';

import { cn } from '../../lib/cn';

type SpotlightCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  details: string[];
  className?: string;
};

type CardStyle = React.CSSProperties & {
  '--spotlight-color'?: string;
  '--spotlight-x'?: string;
  '--spotlight-y'?: string;
};

export function SpotlightCard({
  eyebrow,
  title,
  description,
  accent,
  details,
  className,
}: SpotlightCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  const updateSpotlight = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;

    if (!card) {
      return;
    }

    const rect = card.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    card.style.setProperty('--spotlight-x', `${x}%`);
    card.style.setProperty('--spotlight-y', `${y}%`);
  }, []);

  const resetSpotlight = React.useCallback(() => {
    const card = cardRef.current;

    if (!card) {
      return;
    }

    card.style.setProperty('--spotlight-x', '50%');
    card.style.setProperty('--spotlight-y', '50%');
  }, []);

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ y: -8, scale: 1.01 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      onMouseMove={updateSpotlight}
      onMouseLeave={resetSpotlight}
      style={
        {
          '--spotlight-color': accent,
          '--spotlight-x': '50%',
          '--spotlight-y': '50%',
        } as CardStyle
      }
      className={cn(
        'group relative overflow-hidden rounded-[2rem] border border-white/12 bg-black/25 p-6 shadow-[0_22px_80px_rgba(2,6,23,0.45)] backdrop-blur-xl',
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(circle at var(--spotlight-x) var(--spotlight-y), color-mix(in srgb, var(--spotlight-color) 46%, transparent) 0%, transparent 44%)',
        }}
      />
      <div className="pointer-events-none absolute inset-[1px] rounded-[calc(2rem-1px)] border border-white/6 bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(255,255,255,0.02)_30%,rgba(255,255,255,0.03)_100%)]" />
      <div className="relative z-10">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-white/60">
          {eyebrow}
        </p>
        <h3 className="mb-3 text-2xl font-semibold tracking-tight text-white">{title}</h3>
        <p className="mb-6 text-sm leading-7 text-slate-300">{description}</p>
        <ul className="space-y-3 text-sm text-slate-200">
          {details.map((detail) => (
            <li key={detail} className="flex items-start gap-3">
              <span
                className="mt-2 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: accent }}
              />
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.article>
  );
}
