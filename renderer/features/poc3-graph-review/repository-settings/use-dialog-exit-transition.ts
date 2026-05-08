import { useEffect, useState } from 'react';
import { POC3_MOTION_TIMEOUT_MS } from '../components/motion-timing';

export function useDialogExitTransition(open: boolean): {
  rendered: boolean;
  closing: boolean;
} {
  const [hasOpened, setHasOpened] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
      setClosing(false);
      return;
    }
    if (!hasOpened) {
      return;
    }
    setClosing(true);
    const timerId = window.setTimeout(() => {
      setHasOpened(false);
      setClosing(false);
    }, POC3_MOTION_TIMEOUT_MS.dialogBlurExit);
    return () => window.clearTimeout(timerId);
  }, [open, hasOpened]);

  return { rendered: open || hasOpened, closing };
}
