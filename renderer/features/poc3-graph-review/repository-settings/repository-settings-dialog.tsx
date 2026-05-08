'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { Message } from './_shared/forms';
import { ConfirmOriginMismatchDialog } from './confirm-origin-mismatch-dialog';
import { ProviderSection } from './provider-section';
import { RepositorySection } from './repository-section';
import { SETTINGS_LAYOUT_ID } from './repository-draft-helpers';
import { useDialogExitTransition } from './use-dialog-exit-transition';
import { useRepositorySettings } from './use-repository-settings';
import { POC3_MOTION_DURATION, POC3_MOTION_EASE } from '../components/motion-timing';

interface RepositorySettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export { SETTINGS_LAYOUT_ID };

export function RepositorySettingsDialog({ open, onClose }: RepositorySettingsDialogProps) {
  const { rendered, closing } = useDialogExitTransition(open);
  const settings = useRepositorySettings();

  useEffect(() => {
    if (open) {
      settings.reload();
    }
  }, [open, settings.reload]);

  const closeDialog = () => {
    if (settings.confirmMismatch) {
      settings.resolveConfirmMismatch(false);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {rendered ? (
        <motion.div
          key="poc3-settings-layer"
          className="fixed inset-0 z-[60]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: POC3_MOTION_DURATION.fast,
            ease: POC3_MOTION_EASE.standard,
          }}
        >
          <motion.div
            className="absolute inset-0 bg-black/24 backdrop-blur-[6px]"
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={
              closing
                ? { opacity: 0, backdropFilter: 'blur(10px)' }
                : { opacity: 1, backdropFilter: 'blur(6px)' }
            }
            transition={{
              duration: POC3_MOTION_DURATION.settingsSurface,
              ease: POC3_MOTION_EASE.standard,
            }}
          />
          <motion.div
            key="poc3-settings-shell"
            className="absolute inset-0 z-10 flex items-center justify-center p-4 sm:p-8"
            onClick={(event) => {
              if (!closing && event.target === event.currentTarget) {
                closeDialog();
              }
            }}
          >
            <motion.div
              layoutId={SETTINGS_LAYOUT_ID}
              className="max-h-[calc(100vh-2rem)] w-[min(96vw,1120px)] rounded-2xl bg-[linear-gradient(210deg,rgba(255,255,255,0.22)_6.2%,rgba(20,20,20,0.5)_21.56%,rgba(50,50,50,0.5)_69.03%,rgba(255,255,255,0.4)_96.99%)] p-px shadow-[0_0_44px_rgba(0,0,0,0.8)]"
              initial={{ opacity: 0, scale: 0.98, filter: 'blur(12px)' }}
              animate={
                closing
                  ? { opacity: 0, scale: 0.985, filter: 'blur(64px)' }
                  : { opacity: 1, scale: 1, filter: 'blur(0px)' }
              }
              transition={{
                duration: POC3_MOTION_DURATION.settingsSurface,
                ease: POC3_MOTION_EASE.standard,
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="poc3-repository-settings-title"
                className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-[#131313]/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-34px_70px_rgba(0,0,0,0.2)] backdrop-blur-[16px]"
              >
                <DialogHeader onClose={closeDialog} />
                <div className="space-y-6 p-5">
                  {settings.loadError ? <Message tone="error">{settings.loadError}</Message> : null}
                  <ProviderSection
                    drafts={settings.providerDrafts}
                    onAdd={settings.addProviderDraft}
                    onChange={settings.updateProviderDraft}
                    onSave={settings.saveProvider}
                    onTest={settings.testProvider}
                  />
                  <RepositorySection
                    drafts={settings.profileDrafts}
                    providers={settings.providers}
                    providerById={settings.providerById}
                    onAdd={settings.addProfileDraft}
                    onChange={settings.updateProfileDraft}
                    onResolve={settings.resolveProfileProvider}
                    onBrowse={settings.browseDirectory}
                    onValidate={settings.validateProfile}
                    onSave={settings.saveProfile}
                  />
                </div>
              </section>
            </motion.div>
          </motion.div>
          <ConfirmOriginMismatchDialog
            open={Boolean(settings.confirmMismatch)}
            message={settings.confirmMismatch?.message ?? ''}
            detail={settings.confirmMismatch?.detail}
            onConfirm={() => settings.resolveConfirmMismatch(true)}
            onCancel={() => settings.resolveConfirmMismatch(false)}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function DialogHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 px-5 py-4">
      <div>
        <h2 id="poc3-repository-settings-title" className="text-xl font-semibold text-white">
          Repository settings
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="cursor-pointer rounded-lg border border-white/[0.12] bg-white/[0.06] p-2 text-white transition hover:bg-white/[0.1]"
        aria-label="Close repository settings"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
