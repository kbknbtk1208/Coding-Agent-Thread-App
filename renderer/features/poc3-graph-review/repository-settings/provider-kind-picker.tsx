'use client';

import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { FaGithub, FaGitlab } from 'react-icons/fa6';
import type { IconType } from 'react-icons';
import { useEffect, useId, useRef, useState } from 'react';
import type { RepositoryProviderKind } from '../../../../shared/poc3-domain/repository';

interface ProviderOption {
  id: RepositoryProviderKind;
  label: string;
  icon: IconType;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { id: 'github', label: 'GitHub', icon: FaGithub },
  { id: 'gitlab', label: 'GitLab', icon: FaGitlab },
];

interface ProviderKindPickerProps {
  value: RepositoryProviderKind;
  onChange: (value: RepositoryProviderKind) => void;
}

export function ProviderKindPicker({ value, onChange }: ProviderKindPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickerId = useId();
  const selected = PROVIDER_OPTIONS.find((option) => option.id === value) ?? PROVIDER_OPTIONS[0];
  const SelectedIcon = selected.icon;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <LayoutGroup id={pickerId}>
      <div ref={containerRef} className="relative inline-flex">
        <AnimatePresence>
          {isOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              className="absolute bottom-[calc(100%+10px)] left-0 z-30 flex overflow-hidden rounded-full border border-white/[0.18] bg-[#111111]/90 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-28px_58px_rgba(0,0,0,0.46),0_18px_64px_rgba(0,0,0,0.52)] backdrop-blur-[48px]"
              role="listbox"
              aria-label="Repository provider kind"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0.045)_34%,rgba(255,255,255,0.018)_62%,rgba(0,0,0,0.3)_100%)]"
              />
              {PROVIDER_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isActive = option.id === value;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                    }}
                    className={`relative flex h-14 min-w-[132px] items-center justify-center gap-2 px-5 text-sm font-semibold transition ${
                      isActive ? 'text-white' : 'text-[#aeb6bd] hover:text-white'
                    }`}
                  >
                    {isActive ? (
                      <motion.span
                        layoutId="poc3-provider-kind-active"
                        className="absolute inset-0 bg-white/[0.13] shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                      />
                    ) : null}
                    <Icon className="relative z-10 h-4 w-4" aria-hidden="true" />
                    <span className="relative z-10">{option.label}</span>
                  </button>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="relative flex h-12 min-w-[150px] items-center justify-center gap-3 overflow-hidden rounded-full border border-white/[0.42] bg-[#101010]/90 px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-22px_44px_rgba(0,0,0,0.38)] backdrop-blur-[48px] transition hover:bg-[#1b1b1b]/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479FFA] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          aria-label={`Provider: ${selected.label}`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={selected.id}
              className="flex items-center gap-2"
              initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            >
              <SelectedIcon className="h-4 w-4" aria-hidden="true" />
              {selected.label}
            </motion.span>
          </AnimatePresence>
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <ChevronDown className="h-4 w-4 text-[#868F97]" aria-hidden="true" />
          </motion.span>
        </button>
      </div>
    </LayoutGroup>
  );
}
