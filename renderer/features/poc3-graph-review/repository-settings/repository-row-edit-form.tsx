import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCallback } from 'react';
import type React from 'react';
import type { PublicRepositoryProvider } from '../../../../shared/poc3-domain/repository';
import {
  Label,
  LabeledInput,
  PathInput,
  PrimaryButton,
  RowMessage,
  SecondaryButton,
} from './_shared/forms';
import {
  getAutoWorktreePath,
  providerOptionLabel,
  resolutionText,
  type ProfileDraft,
} from './repository-draft-helpers';
import {
  type ResolveProviderRequest,
  useDebouncedResolveProvider,
} from './use-debounced-resolve-provider';
import { POC3_MOTION_DURATION, POC3_MOTION_EASE } from '../components/motion-timing';

export function RepositoryRowEditForm(props: {
  draft: ProfileDraft;
  providerById: Map<string, PublicRepositoryProvider>;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
  onResolve: (request: ResolveProviderRequest) => void;
  onBrowse: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  onValidate: (draft: ProfileDraft) => void;
  onSave: (draft: ProfileDraft) => void;
}): React.ReactElement {
  const { draft, providerById, onChange, onResolve, onBrowse, onValidate, onSave } = props;
  const selectedProvider = providerById.get(draft.repositoryProviderId);
  const canSave =
    !draft.busy &&
    !draft.isResolvingProvider &&
    Boolean(draft.originUrl.trim()) &&
    Boolean(draft.localClonePath.trim()) &&
    Boolean(draft.worktreeRootPath.trim());
  const resolveCurrentOrigin = useCallback(
    (request: ResolveProviderRequest) => onResolve(request),
    [onResolve],
  );

  useDebouncedResolveProvider({
    draftId: draft.draftId,
    originUrl: draft.originUrl,
    isEditing: draft.isEditing,
    onResolve: resolveCurrentOrigin,
  });

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_minmax(220px,0.7fr)]">
        <LabeledInput
          label="origin url"
          value={draft.originUrl}
          placeholder="https://github.com/owner/repo または git@gitlab.com:group/project.git"
          onBlur={() => onResolve({ draftId: draft.draftId, originUrl: draft.originUrl.trim() })}
          onChange={(value) =>
            onChange(draft.draftId, {
              originUrl: value,
              repositoryProviderId: '',
              resolution: null,
              isResolvingProvider: false,
              error: null,
              message: null,
            })
          }
        />
        <div className="min-w-0">
          <Label>resolved provider</Label>
          <p className="mt-1 flex h-10 items-center truncate text-sm text-white">
            {draft.isResolvingProvider
              ? '解決中...'
              : selectedProvider
                ? providerOptionLabel(selectedProvider)
                : '未解決'}
          </p>
        </div>
      </div>
      <p className="mt-2 min-h-4 text-xs text-[#a8b0b8]">
        {draft.isResolvingProvider
          ? 'Provider を解決中...'
          : selectedProvider
            ? selectedProvider.baseUrl
            : draft.error
              ? ''
              : resolutionText(draft.resolution)}
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PathInput
          label="local clone path"
          value={draft.localClonePath}
          placeholder="C:\\Users\\nkubo\\Dev\\my-repo"
          onChange={(value) => {
            const autoWorktreePath = getAutoWorktreePath(value);
            onChange(draft.draftId, {
              localClonePath: value,
              worktreeRootPath:
                !draft.worktreeRootPath || draft.worktreeRootPath === draft.lastAutoWorktreePath
                  ? autoWorktreePath
                  : draft.worktreeRootPath,
              lastAutoWorktreePath: autoWorktreePath,
            });
          }}
          onBrowse={() => onBrowse(draft, 'localClonePath')}
        />
        <PathInput
          label="worktree root path"
          value={draft.worktreeRootPath}
          placeholder="C:\\Users\\nkubo\\Dev\\my-repo_worktree"
          onChange={(value) => onChange(draft.draftId, { worktreeRootPath: value })}
          onBrowse={() => onBrowse(draft, 'worktreeRootPath')}
        />
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={() =>
            onChange(draft.draftId, {
              showSetupScript: !draft.showSetupScript,
            })
          }
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35"
        >
          <motion.span
            animate={{ rotate: draft.showSetupScript ? 180 : 0 }}
            transition={{
              duration: POC3_MOTION_DURATION.overlay,
              ease: POC3_MOTION_EASE.easeInOut,
            }}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </motion.span>
          setup script
        </button>
        <AnimatePresence initial={false}>
          {draft.showSetupScript ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <textarea
                value={draft.setupScriptText}
                onChange={(event) =>
                  onChange(draft.draftId, {
                    setupScriptText: event.target.value,
                  })
                }
                className="mt-3 min-h-[92px] w-full resize-y rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
                placeholder={'npm install;\nnpx prisma generate;'}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-5 flex-1">
          <RowMessage error={draft.error} message={draft.message} />
        </div>
        <div className="flex gap-2">
          <SecondaryButton disabled={draft.busy} onClick={() => onValidate(draft)}>
            Validate
          </SecondaryButton>
          <PrimaryButton disabled={!canSave} onClick={() => onSave(draft)}>
            Save
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
