'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Children, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface AgentReviewGlassSelectProps {
  value: string;
  onChange(value: string): void;
  disabled?: boolean;
  ariaLabel?: string;
  children: React.ReactNode;
}

interface AgentReviewGlassSelectOption {
  value: string;
  label: string;
  disabled: boolean;
}

export function AgentReviewGlassSelect({
  value,
  onChange,
  disabled,
  ariaLabel,
  children,
}: AgentReviewGlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const options = useMemo<AgentReviewGlassSelectOption[]>(
    () =>
      Children.toArray(children).flatMap((child) => {
        if (
          !isValidElement<{
            value?: string | number;
            children?: React.ReactNode;
            disabled?: boolean;
          }>(child)
        ) {
          return [];
        }

        const optionValue = child.props.value == null ? '' : String(child.props.value);
        return [
          {
            value: optionValue,
            label: getOptionLabel(child.props.children, optionValue),
            disabled: Boolean(child.props.disabled),
          },
        ];
      }),
    [children],
  );
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const selectedOptionIndex = options.findIndex((option) => option.value === selectedOption?.value);
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

  const selectOption = (option: AgentReviewGlassSelectOption) => {
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setIsOpen(false);
  };

  const moveSelection = (direction: 1 | -1) => {
    const enabledOptions = options.filter((option) => !option.disabled);
    if (enabledOptions.length === 0) {
      return;
    }

    const currentIndex = enabledOptions.findIndex((option) => option.value === value);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : enabledOptions.length - 1
        : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    onChange(enabledOptions[nextIndex].value);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
        }
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        disabled={disabled}
        className="flex h-8 w-full items-center rounded-[7px] border border-white/[0.08] bg-[#25262b]/92 px-2 pr-7 text-left text-[11px] font-medium text-white outline-none backdrop-blur-[18px] transition hover:bg-[#2c2d33] focus:border-[#58d7ff]/28 focus:shadow-[0_0_0_2px_rgba(88,215,255,0.07)] disabled:cursor-not-allowed disabled:opacity-50"
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
          if (event.key === 'Tab') {
            setIsOpen(false);
          }
        }}
      >
        <span className="block min-w-0 flex-1 truncate">{selectedOption?.label ?? ''}</span>
      </button>
      <ChevronDown
        className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-white/38"
        aria-hidden="true"
      />
      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel ? `${ariaLabel} options` : undefined}
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-56 min-w-full overflow-y-auto rounded-[9px] border border-white/[0.08] bg-[#17181d]/96 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.46)] backdrop-blur-[20px]"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <button
                key={`${option.value}-${option.label}`}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={option.disabled}
                tabIndex={-1}
                className={`flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-left text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  isSelected
                    ? 'bg-white/[0.06] text-white'
                    : 'text-white/72 hover:bg-white/[0.045] hover:text-white'
                }`}
                onClick={() => selectOption(option)}
              >
                <span className="block min-w-0 flex-1 truncate">{option.label}</span>
                {isSelected ? (
                  <Check className="size-3 shrink-0 text-[#66dd89]" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function getOptionLabel(children: React.ReactNode, fallback: string): string {
  const labels = Children.toArray(children)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : ''))
    .filter(Boolean);
  return labels.join(' ').trim() || fallback;
}
