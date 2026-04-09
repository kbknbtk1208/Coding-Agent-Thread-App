'use client';

import { Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface MacOSSidebarProps {
  items: string[];
  defaultOpen?: boolean;
  initialSelectedIndex?: number;
  children?: ReactNode;
  className?: string;
}

export function MacOSSidebar({
  items,
  defaultOpen = true,
  initialSelectedIndex = 0,
  children,
  className,
}: MacOSSidebarProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        'flex w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/6 p-3 shadow-[0_24px_80px_rgba(2,8,23,0.35)] backdrop-blur-xl',
        className,
      )}
    >
      <motion.aside
        animate={{ width: isOpen ? 248 : 72 }}
        transition={{ type: 'spring', bounce: 0.24, duration: 0.65 }}
        className={cn(
          'shrink-0 rounded-[22px] border border-white/10 bg-black/25 p-2 text-slate-100',
          isOpen ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]' : '',
        )}
      >
        <div
          className={cn(
            'flex items-center p-2 text-slate-300',
            isOpen ? 'justify-between gap-4' : 'justify-center',
          )}
        >
          <AnimatePresence initial={false}>
            {isOpen ? (
              <motion.button
                key="new"
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/8 transition hover:bg-white/12"
              >
                <Plus className="h-4 w-4" />
              </motion.button>
            ) : null}
          </AnimatePresence>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 transition hover:bg-white/12"
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {isOpen ? (
            <motion.div
              key="menu"
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(4px)' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="mt-4 flex flex-col gap-2"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {items.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onClick={() => setSelectedIndex(index)}
                  className="relative overflow-hidden rounded-2xl px-4 py-3 text-left"
                >
                  <AnimatePresence initial={false}>
                    {selectedIndex === index ? (
                      <motion.span
                        key="selected"
                        className="absolute inset-0 rounded-2xl bg-white/12"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      />
                    ) : null}
                  </AnimatePresence>
                  <AnimatePresence initial={false}>
                    {hoveredIndex === index && selectedIndex !== index ? (
                      <motion.span
                        key="hover"
                        layoutId="macos-sidebar-hover"
                        className="absolute inset-0 rounded-2xl bg-white/6"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                      />
                    ) : null}
                  </AnimatePresence>
                  <span
                    className={cn(
                      'relative z-10 block text-sm tracking-tight',
                      selectedIndex === index ? 'font-medium text-white' : 'text-slate-400',
                    )}
                  >
                    {item}
                  </span>
                </button>
              ))}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.aside>

      <div className="min-h-full flex-1 overflow-y-auto pl-4 sm:pl-8">{children}</div>
    </div>
  );
}
