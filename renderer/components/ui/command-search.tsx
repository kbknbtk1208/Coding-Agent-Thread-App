'use client';

import { useState, useMemo, useEffect, useRef, type KeyboardEvent, type FC } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, User, Bell, HelpCircle, MessageSquare, ArrowRight } from 'lucide-react';

export interface CommandItem {
  id: string;
  title: string;
  section: 'Suggestions' | 'Settings' | 'Help';
  icon: ReactNode;
  shortcut?: string;
  action: () => void;
}

/*  DEFAULT DATA */
const DEFAULT_ITEMS: CommandItem[] = [
  {
    id: '1',
    title: 'Calendar',
    section: 'Suggestions',
    icon: <ArrowRight size={16} />,
    action: () => console.log('Calendar'),
  },
  {
    id: '2',
    title: 'Search Emoji',
    section: 'Suggestions',
    icon: <ArrowRight size={16} />,
    action: () => console.log('Emoji'),
  },
  {
    id: '3',
    title: 'Calculator',
    section: 'Suggestions',
    icon: <ArrowRight size={16} />,
    action: () => console.log('Calculator'),
  },

  {
    id: '4',
    title: 'Profile',
    section: 'Settings',
    icon: <User size={16} />,
    shortcut: '⌘ P',
    action: () => console.log('Profile'),
  },
  {
    id: '5',
    title: 'Notifications',
    section: 'Settings',
    icon: <Bell size={16} />,
    shortcut: '⌘ N',
    action: () => console.log('Notifications'),
  },

  {
    id: '6',
    title: 'FAQ',
    section: 'Help',
    icon: <HelpCircle size={16} />,
    action: () => console.log('FAQ'),
  },
  {
    id: '7',
    title: 'Messages',
    section: 'Help',
    icon: <MessageSquare size={16} />,
    action: () => console.log('Messages'),
  },
];

interface Props {
  items?: CommandItem[];
}

export const CommandSearch: FC<Props> = ({ items = DEFAULT_ITEMS }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const timeout = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'f' &&
        !isOpen &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    // Use capture to catch the event before other listeners
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()));
  }, [query, items]);

  useEffect(() => {
    requestAnimationFrame(() => setActiveIndex(0));
  }, [query]);

  const sections = useMemo(() => {
    const groups: { [key: string]: CommandItem[] } = {};
    filteredItems.forEach((item) => {
      if (!groups[item.section]) groups[item.section] = [];
      groups[item.section].push(item);
    });

    return Object.entries(groups).map(([name, items]) => ({
      name,
      items,
    }));
  }, [filteredItems]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % filteredItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + filteredItems.length) % filteredItems.length);
    } else if (e.key === 'Enter') {
      const selectedItem = filteredItems[activeIndex];
      if (selectedItem) {
        selectedItem.action();
        setIsOpen(false);
      }
    }
  };

  const sharedTransition = {
    type: 'tween' as const,
    ease: 'easeOut' as const,
    duration: 0.15,
  };

  return (
    <>
      <AnimatePresence mode="popLayout">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[8px]"
            onClick={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative z-50 h-10 w-full max-w-[280px] md:w-64">
        <AnimatePresence mode="popLayout">
          {!isOpen ? (
            <motion.button
              key="trigger"
              layoutId="command-pallete"
              onClick={() => setIsOpen(true)}
              className="group absolute top-0 left-0 flex h-10 w-full items-center gap-3 overflow-hidden rounded-lg border border-white/[0.16] bg-white/[0.08] px-4 py-2 text-[#868F97] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-[32px] hover:text-white"
              transition={sharedTransition}
            >
              <motion.div layoutId="search-icon" transition={sharedTransition}>
                <Search size={16} className="opacity-40" />
              </motion.div>
              <motion.span
                layoutId="search-text"
                transition={sharedTransition}
                className="pr-8 text-sm font-medium"
              >
                Find...
              </motion.span>
              <motion.kbd
                layoutId="search-shortcut"
                transition={sharedTransition}
                className="absolute right-2 rounded border border-white/[0.12] bg-white/[0.08] px-2 py-0.5 text-[14px] font-bold text-[#868F97] group-hover:text-[#FFA16C]"
              >
                F
              </motion.kbd>
            </motion.button>
          ) : (
            <motion.div
              layoutId="command-pallete"
              transition={sharedTransition}
              className="absolute -top-2 -left-2 z-50 flex h-80 w-xs flex-col overflow-hidden rounded-lg border border-white/[0.16] bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-32px_70px_rgba(0,0,0,0.3),0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-[44px] md:w-[400px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Header */}
              <div className="flex items-center border-b border-white/[0.12] bg-black/[0.08] px-4 py-3.5">
                <motion.div layoutId="search-icon" transition={sharedTransition}>
                  <Search size={18} className="mr-3 text-[#FFA16C]" strokeWidth={2.5} />
                </motion.div>
                <div className="relative flex flex-1 items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-transparent text-base font-medium text-white outline-none md:text-[15px]"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  {!query && (
                    <motion.span
                      layoutId="search-text"
                      transition={sharedTransition}
                      className="pointer-events-none absolute left-0 text-[15px] font-medium text-[#868F97]"
                    >
                      Find...
                    </motion.span>
                  )}
                </div>
                <div className="ml-2 flex items-center gap-1.5">
                  <motion.span
                    layoutId="search-shortcut"
                    transition={sharedTransition}
                    className="rounded border border-white/[0.12] bg-white/[0.08] p-0.5 px-1 text-[11px] font-bold text-[#868F97]"
                  >
                    Esc
                  </motion.span>
                </div>
              </div>

              {/* Results Body */}
              <div className="fey-scrollbar flex-1 overflow-y-auto p-1.5 md:max-h-[380px]">
                {filteredItems.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[#868F97]">
                    No results found for "{query}"
                  </div>
                ) : (
                  <div className="space-y-4 py-1">
                    {sections.map((section) => (
                      <div key={section.name} className="space-y-1">
                        <h3 className="px-3 py-1 text-[11px] font-semibold text-[#FFA16C] uppercase">
                          {section.name}
                        </h3>
                        <div className="space-y-0.5">
                          {section.items.map((item) => {
                            const globalIndex = filteredItems.findIndex((fi) => fi.id === item.id);
                            const isActive = globalIndex === activeIndex;

                            return (
                              <button
                                key={item.id}
                                className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${isActive ? 'border border-white/[0.12] bg-white/[0.1] text-white' : 'text-[#868F97] hover:bg-white/[0.06] hover:text-white'} `}
                                onMouseEnter={() => setActiveIndex(globalIndex)}
                                onClick={() => {
                                  item.action();
                                  setIsOpen(false);
                                }}
                              >
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`${isActive ? 'text-[#FFA16C]' : 'text-[#868F97] group-hover:text-[#FFA16C]'}`}
                                  >
                                    {item.icon}
                                  </span>
                                  <span className="text-[14px] leading-none font-medium">
                                    {item.title}
                                  </span>
                                </div>

                                {item.shortcut && (
                                  <kbd
                                    className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${isActive ? 'border-white/[0.14] bg-white/[0.08] text-[#d0d5db]' : 'border-transparent bg-transparent text-[#868F97]'} `}
                                  >
                                    {item.shortcut}
                                  </kbd>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
};
