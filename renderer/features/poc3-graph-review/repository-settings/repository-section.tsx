import { motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import type React from 'react';
import type { PublicRepositoryProvider } from '../../../../shared/poc3-domain/repository';
import { Message, SectionTitle } from './_shared/forms';
import {
  FEY_GLASS_CARD_CLASS,
  LIST_ITEM_MOTION_VARIANTS,
  repositoryAddLayoutId,
  type ProfileDraft,
} from './repository-draft-helpers';
import { RepositoryRowEditForm } from './repository-row-edit-form';
import { RepositoryRowView } from './repository-row-view';
import type { ResolveProviderRequest } from './use-debounced-resolve-provider';
import {
  POC3_MOTION_DELAY,
  POC3_MOTION_DURATION,
  POC3_MOTION_EASE,
} from '../components/motion-timing';

export function RepositorySection(props: {
  drafts: ProfileDraft[];
  providers: PublicRepositoryProvider[];
  providerById: Map<string, PublicRepositoryProvider>;
  onAdd: () => void;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
  onResolve: (request: ResolveProviderRequest) => void;
  onBrowse: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  onValidate: (draft: ProfileDraft) => void;
  onSave: (draft: ProfileDraft) => void;
}): React.ReactElement {
  const {
    drafts,
    providers,
    providerById,
    onAdd,
    onChange,
    onResolve,
    onBrowse,
    onValidate,
    onSave,
  } = props;
  const hasUnsavedDraft = drafts.some((draft) => !draft.repositoryProfileId);
  const addLayoutId = repositoryAddLayoutId(drafts.length);

  return (
    <section className="space-y-3">
      <SectionTitle title="Repository" />
      {providers.length === 0 ? (
        <Message tone="info">Repository を登録する前に Provider を追加してください。</Message>
      ) : null}
      <motion.div layout className="space-y-3">
        {drafts.map((draft, index) => (
          <RepositoryDraftRow
            key={draft.draftId}
            draft={draft}
            index={index}
            providerById={providerById}
            onChange={onChange}
            onResolve={onResolve}
            onBrowse={onBrowse}
            onValidate={onValidate}
            onSave={onSave}
          />
        ))}
        {!hasUnsavedDraft ? <RepositoryAddButton layoutId={addLayoutId} onClick={onAdd} /> : null}
      </motion.div>
    </section>
  );
}

function RepositoryDraftRow(props: {
  draft: ProfileDraft;
  index: number;
  providerById: Map<string, PublicRepositoryProvider>;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
  onResolve: (request: ResolveProviderRequest) => void;
  onBrowse: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  onValidate: (draft: ProfileDraft) => void;
  onSave: (draft: ProfileDraft) => void;
}): React.ReactElement {
  const { draft, index, providerById, onChange, onResolve, onBrowse, onValidate, onSave } = props;
  const shouldReduceMotion = useReducedMotion();
  const reducedMotion = shouldReduceMotion === true;

  return (
    <motion.div
      layout
      layoutId={draft.layoutId}
      {...(draft.repositoryProfileId
        ? {
            custom: { index, reducedMotion, extraDelay: POC3_MOTION_DELAY.settingsItemDelay },
            variants: LIST_ITEM_MOTION_VARIANTS,
            initial: 'hidden',
            animate: 'visible',
          }
        : {})}
      className={`${FEY_GLASS_CARD_CLASS} p-4`}
    >
      {draft.isEditing ? (
        <RepositoryRowEditForm
          draft={draft}
          providerById={providerById}
          onChange={onChange}
          onResolve={onResolve}
          onBrowse={onBrowse}
          onValidate={onValidate}
          onSave={onSave}
        />
      ) : (
        <RepositoryRowView draft={draft} providerById={providerById} onChange={onChange} />
      )}
    </motion.div>
  );
}

function RepositoryAddButton({ layoutId, onClick }: { layoutId: string; onClick: () => void }) {
  const shouldReduceMotion = useReducedMotion();
  const reducedMotion = shouldReduceMotion === true;
  const delay = reducedMotion
    ? 0
    : POC3_MOTION_DELAY.repositoryListBase + POC3_MOTION_DELAY.settingsItemDelay;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reducedMotion ? 0.08 : POC3_MOTION_DURATION.listItem,
        ease: POC3_MOTION_EASE.standard,
        delay,
      }}
      className="flex min-h-[104px] items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-black/[0.08]"
    >
      <motion.button
        type="button"
        layout
        layoutId={layoutId}
        onClick={onClick}
        className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-4 text-sm font-medium text-white transition hover:border-[#d8e071]/35"
        transition={{
          duration: POC3_MOTION_DURATION.listItem,
          ease: POC3_MOTION_EASE.standard,
        }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Repository
      </motion.button>
    </motion.div>
  );
}
