'use client';

import { useEffect, useRef, type RefObject } from 'react';

export interface UseDialogA11yOptions {
  rendered: boolean;
  closing: boolean;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  disableEscape?: boolean;
}

export interface UseDialogA11yReturn {
  backdropProps: {
    onMouseDown: (event: React.MouseEvent) => void;
    onMouseUp: (event: React.MouseEvent) => void;
  };
}

export function useDialogA11y({
  rendered,
  closing,
  onClose,
  initialFocusRef,
  disableEscape,
}: UseDialogA11yOptions): UseDialogA11yReturn {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const overlayMouseDownTargetRef = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!rendered || closing) {
      return;
    }
    initialFocusRef?.current?.focus();
  }, [rendered, closing, initialFocusRef]);

  useEffect(() => {
    if (!rendered || closing || disableEscape) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [rendered, closing, disableEscape]);

  return {
    backdropProps: {
      onMouseDown: (event) => {
        overlayMouseDownTargetRef.current =
          event.target === event.currentTarget ? event.currentTarget : null;
      },
      onMouseUp: (event) => {
        const downTarget = overlayMouseDownTargetRef.current;
        overlayMouseDownTargetRef.current = null;
        if (closing) {
          return;
        }
        if (downTarget === event.currentTarget && event.target === event.currentTarget) {
          onCloseRef.current();
        }
      },
    },
  };
}
