'use client';

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

export interface ScrollTargetController {
  scrollToLine(line: number): void;
}

interface ScrollTargetRegistry {
  controller: ScrollTargetController;
  register(handler: ((line: number) => void) | null): void;
}

const ScrollTargetRegistryContext = createContext<ScrollTargetRegistry | null>(null);

export function ScrollTargetProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<((line: number) => void) | null>(null);

  const register = useCallback((handler: ((line: number) => void) | null) => {
    handlerRef.current = handler;
  }, []);

  const controller = useMemo<ScrollTargetController>(
    () => ({
      scrollToLine(line: number) {
        handlerRef.current?.(line);
      },
    }),
    [],
  );

  const value = useMemo<ScrollTargetRegistry>(
    () => ({ controller, register }),
    [controller, register],
  );

  return (
    <ScrollTargetRegistryContext.Provider value={value}>
      {children}
    </ScrollTargetRegistryContext.Provider>
  );
}

export function useScrollTarget(): ScrollTargetController | null {
  const ctx = useContext(ScrollTargetRegistryContext);
  return ctx?.controller ?? null;
}

export function useRegisterScrollTarget(): (handler: ((line: number) => void) | null) => void {
  const ctx = useContext(ScrollTargetRegistryContext);
  return ctx?.register ?? noop;
}

function noop() {}

// 後方互換: 直接 Context として使われる箇所がないか確認用に残す
export const ScrollTargetContext = ScrollTargetRegistryContext;
