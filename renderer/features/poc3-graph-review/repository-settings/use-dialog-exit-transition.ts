import { useEffect, useState } from 'react';
import { POC3_MOTION_TIMEOUT_MS } from '../components/motion-timing';

export function useDialogExitTransition(open: boolean): {
  rendered: boolean;
  closing: boolean;
} {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return;
    }
    if (!rendered) {
      return;
    }
    setClosing(true);
    const timerId = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, POC3_MOTION_TIMEOUT_MS.dialogBlurExit);
    return () => window.clearTimeout(timerId);
  }, [open, rendered]);

  return { rendered, closing };
}
