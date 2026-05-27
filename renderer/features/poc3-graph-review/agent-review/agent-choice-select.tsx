'use client';

import { Bot, Check, ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FaGithub } from 'react-icons/fa6';
import { SiOpenai } from 'react-icons/si';
import type { AgentKind } from '../../../../shared/domain/agent';

const AGENT_OPTIONS: { value: AgentKind; label: string; provider: string }[] = [
  { value: 'codex', label: 'Codex', provider: 'OpenAI' },
  { value: 'copilot', label: 'Copilot', provider: 'GitHub' },
];

export interface AgentChoiceSelectProps {
  value: AgentKind;
  onChange(value: AgentKind): void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  buttonHeight?: string;
  menuWidthClassName?: string;
}

export function AgentChoiceSelect({
  value,
  onChange,
  disabled,
  ariaLabel = 'Agent',
  className = 'w-[164px]',
  buttonHeight = 'h-12',
  menuWidthClassName = 'w-[260px]',
}: AgentChoiceSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = AGENT_OPTIONS.find((option) => option.value === value) ?? AGENT_OPTIONS[0];
  const selectedOptionIndex = AGENT_OPTIONS.findIndex(
    (option) => option.value === selectedOption.value,
  );
  const activeOptionId =
    isOpen && selectedOptionIndex >= 0 ? `${listboxId}-option-${selectedOptionIndex}` : undefined;

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
    }
  }, [disabled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const moveSelection = (direction: 1 | -1) => {
    const currentIndex = AGENT_OPTIONS.findIndex((option) => option.value === value);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : AGENT_OPTIONS.length - 1
        : (currentIndex + direction + AGENT_OPTIONS.length) % AGENT_OPTIONS.length;
    onChange(AGENT_OPTIONS[nextIndex].value);
  };

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-label={ariaLabel}
        className={`flex ${buttonHeight} w-full cursor-pointer items-center gap-2 rounded-[9px] border border-white/[0.08] bg-[#25262b]/92 px-2.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-[18px] transition hover:bg-[#2c2d33] focus:border-[#58d7ff]/30 focus:shadow-[0_0_0_2px_rgba(88,215,255,0.08)] disabled:cursor-not-allowed disabled:opacity-50`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            moveSelection(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
              setIsOpen(true);
              return;
            }
            moveSelection(-1);
          }
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setIsOpen((current) => !current);
          }
          if (event.key === 'Escape' || event.key === 'Tab') {
            setIsOpen(false);
          }
        }}
      >
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-[8px] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] ${
            value === 'codex' ? 'bg-[#89c9bd] text-white' : 'bg-white text-[#111217]'
          }`}
        >
          <AgentChoiceIcon agent={value} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-4 text-white">
            {selectedOption.label}
          </span>
          <span className="block truncate text-[11px] font-medium leading-4 text-white/50">
            {selectedOption.provider}
          </span>
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-white/70 transition ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} options`}
          className={`absolute left-0 top-[calc(100%+6px)] z-50 ${menuWidthClassName} overflow-hidden rounded-[9px] border border-white/[0.08] bg-[#17181d]/96 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.46)] backdrop-blur-[20px]`}
        >
          {AGENT_OPTIONS.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={-1}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-[7px] px-2 py-2 text-left transition ${
                  isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.045]'
                }`}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] ${
                    option.value === 'codex' ? 'bg-[#89c9bd] text-white' : 'bg-white text-[#111217]'
                  }`}
                >
                  <AgentChoiceIcon agent={option.value} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-bold leading-4 text-white">
                      {option.label}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] font-medium leading-4 text-white/48">
                    {option.provider}
                  </span>
                </span>
                {isSelected ? (
                  <Check className="size-3.5 shrink-0 text-[#66dd89]" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AgentChoiceIcon({ agent }: { agent: AgentKind }) {
  if (agent === 'copilot') {
    return <FaGithub className="size-4" aria-hidden="true" />;
  }

  if (agent === 'codex') {
    return <SiOpenai className="size-5" aria-hidden="true" />;
  }

  return <Bot className="size-4" aria-hidden="true" />;
}
