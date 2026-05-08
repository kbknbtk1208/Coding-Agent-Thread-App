import { useEffect, useRef } from 'react';
import type React from 'react';
import { PrimaryButton } from './_shared/forms';

export function ConfirmOriginMismatchDialog(props: {
  open: boolean;
  message: string;
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement | null {
  const { open, message, detail, onConfirm, onCancel } = props;
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    cancelButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/36 p-4 backdrop-blur-[4px]"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="poc3-origin-mismatch-title"
        className="w-[min(92vw,520px)] rounded-2xl border border-white/[0.12] bg-[#151515]/95 p-5 text-white shadow-[0_20px_80px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-[18px]"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="poc3-origin-mismatch-title" className="text-base font-semibold">
          Origin mismatch
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#dce2e8]">{message}</p>
        {detail ? <p className="mt-3 text-xs leading-5 text-[#9ca6b1]">{detail}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-[#479ffa]/35"
          >
            Cancel
          </button>
          <PrimaryButton onClick={onConfirm}>Save anyway</PrimaryButton>
        </div>
      </section>
    </div>
  );
}
