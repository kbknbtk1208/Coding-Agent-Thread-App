'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Settings } from 'lucide-react';
import { useCallback, useId, useState } from 'react';

export interface Poc3ProfileMenuItem {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  layoutId?: string;
  onSelect: () => void;
}

interface Poc3AnimatedProfileMenuProps {
  items: Poc3ProfileMenuItem[];
}

export function Poc3AnimatedProfileMenu({ items }: Poc3AnimatedProfileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const menuItemClassName =
    "group relative block w-[240px] min-w-[240px] overflow-hidden rounded-full bg-[linear-gradient(182.51deg,rgba(255,255,255,0.02)_27.09%,rgba(90,90,90,0.02)_58.59%,rgba(0,0,0,0.02)_92.75%)] px-[9px] py-[7.5px] pl-5 text-left shadow-[0_30.0444px_16.2444px_rgba(0,0,0,0.12),0_15.6px_8.2875px_rgba(0,0,0,0.07),0_6.35556px_4.15556px_rgba(0,0,0,0.04)] backdrop-blur-[10px] [--gradientBorder-gradient:linear-gradient(178.8deg,rgba(255,255,255,0.2464)_10.85%,rgba(20,20,20,0.46)_24.36%,rgba(50,50,50,0.46)_73.67%,rgba(255,255,255,0.46)_90.68%)] [--gradientBorder-size:1px] transition-transform duration-300 before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-[var(--gradientBorder-size)] before:content-[''] before:[background:var(--gradientBorder-gradient)] before:[user-select:none] before:[-webkit-mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)] before:[mask:linear-gradient(black,black)_content-box_exclude,linear-gradient(black,black)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-white after:opacity-0 after:transition-opacity after:duration-100 after:content-[''] hover:after:opacity-[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  const menuItemIconClassName =
    'flex h-8 w-8 items-center justify-center rounded-full text-white/82 transition-colors duration-100 group-hover:text-white/88';
  const menuItemChevronClassName =
    'h-4 w-4 shrink-0 text-white/38 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/62';

  const toggleMenu = useCallback(() => {
    setIsOpen((previous) => !previous);
  }, []);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <nav className="fixed bottom-6 left-6 z-50" role="navigation" aria-label="PoC-3 quick actions">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="poc3-profile-menu"
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              transition: { staggerChildren: 0.08, delayChildren: 0.08 },
            }}
            exit={{ opacity: 0 }}
            className="absolute bottom-24 left-0 space-y-3"
            role="presentation"
          >
            <motion.ul
              id={menuId}
              role="list"
              aria-label="PoC-3 actions"
              className="flex flex-col gap-3"
            >
              {items.map((item) => {
                const Icon = item.icon;

                return (
                  <motion.li
                    key={item.id}
                    initial={{ opacity: 0, x: -16, scale: 0.94 }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      scale: 1,
                      transition: { duration: 0.25, ease: 'easeOut' },
                    }}
                    exit={{
                      opacity: 0,
                      x: -16,
                      scale: 0.92,
                      transition: { duration: 0.16, ease: 'easeInOut' },
                    }}
                    whileHover={{ x: 6 }}
                    transition={{ duration: 0.2 }}
                    role="listitem"
                  >
                    <motion.button
                      type="button"
                      layoutId={item.layoutId}
                      onClick={() => {
                        closeMenu();
                        item.onSelect();
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      className={menuItemClassName}
                      aria-label={item.title}
                    >
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-px rounded-[inherit] bg-[linear-gradient(180deg,rgba(255,255,255,0.075)_0%,rgba(255,255,255,0.038)_48%,rgba(255,255,255,0.018)_100%)] opacity-80 backdrop-blur-[18px] [backdrop-filter:blur(18px)_saturate(145%)]"
                      />
                      <div className="relative z-10 flex items-center gap-3">
                        <span className={menuItemIconClassName}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold leading-[1.2] text-[#e6e6e6]">
                            {item.title}
                          </h3>
                        </div>
                        <ChevronRight className={menuItemChevronClassName} aria-hidden="true" />
                      </div>
                    </motion.button>
                  </motion.li>
                );
              })}
            </motion.ul>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={toggleMenu}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ rotate: isOpen ? 90 : 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(180.9deg,rgba(51,51,57,0.7)_-0.58%,rgba(53,53,56,0.7)_66.34%,rgba(38,38,39,0.7)_101.25%)] text-white shadow-[inset_1.25px_1.25px_1.25px_rgba(255,255,255,0.32),inset_1.25px_-1.25px_1.25px_rgba(255,255,255,0.05),9.2px_43.6px_43.3px_rgba(0,0,0,0.75)] backdrop-blur-[21px]"
        aria-label={isOpen ? 'Close PoC-3 menu' : 'Open PoC-3 menu'}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={menuId}
      >
        <Settings className="h-6 w-6 text-white" aria-hidden="true" />
      </motion.button>
    </nav>
  );
}
