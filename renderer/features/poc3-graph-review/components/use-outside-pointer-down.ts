'use client';

import { useEffect, useRef, type RefObject } from 'react';

export interface UseOutsidePointerDownOptions {
  enabled: boolean;
  refs: Array<RefObject<HTMLElement | null>>;
  onOutside(event: PointerEvent): void;
}

export function useOutsidePointerDown({
  enabled,
  refs,
  onOutside,
}: UseOutsidePointerDownOptions): void {
  const callbackRef = useRef(onOutside);
  callbackRef.current = onOutside;

  const refsRef = useRef(refs);
  refsRef.current = refs;

  useEffect(() => {
    if (!enabled) return;

    function handler(event: PointerEvent) {
      if (event.defaultPrevented) return;

      const path = event.composedPath ? event.composedPath() : null;
      const isInside = refsRef.current.some((ref) => {
        if (!ref.current) return false;
        if (path) return path.includes(ref.current);
        return ref.current.contains(event.target instanceof Node ? event.target : null);
      });

      if (!isInside) {
        callbackRef.current(event);
      }
    }

    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [enabled]);
}
