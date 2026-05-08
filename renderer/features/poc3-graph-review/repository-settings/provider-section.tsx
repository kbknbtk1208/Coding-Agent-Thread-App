import { motion, useReducedMotion } from 'framer-motion';
import { Pencil, Plus, Save, TestTube2 } from 'lucide-react';
import type React from 'react';
import {
  IconButton,
  PrimaryIconButton,
  RowMessage,
  SectionTitle,
  TextInput,
} from './_shared/forms';
import { ProviderKindPicker } from './provider-kind-picker';
import {
  defaultBaseUrl,
  FEY_GLASS_CARD_CLASS,
  hostLabelFromBaseUrl,
  LIST_ITEM_MOTION_VARIANTS,
  providerAddLayoutId,
  type ProviderDraft,
} from './repository-draft-helpers';
import { POC3_MOTION_DURATION, POC3_MOTION_EASE } from '../components/motion-timing';

export function ProviderSection(props: {
  drafts: ProviderDraft[];
  onAdd: () => void;
  onChange: (draftId: string, patch: Partial<ProviderDraft>) => void;
  onSave: (draft: ProviderDraft) => void;
  onTest: (draft: ProviderDraft) => void;
}): React.ReactElement {
  const { drafts, onAdd, onChange, onSave, onTest } = props;
  const shouldReduceMotion = useReducedMotion();
  const reducedMotion = shouldReduceMotion === true;
  const hasUnsavedDraft = drafts.some((draft) => !draft.repositoryProviderId);
  const addLayoutId = providerAddLayoutId(drafts.length);

  return (
    <section className="space-y-3">
      <SectionTitle title="Provider" />
      <motion.div layout className="space-y-3">
        {drafts.map((draft, index) => (
          <motion.div
            key={draft.draftId}
            layout
            layoutId={draft.layoutId}
            {...(draft.repositoryProviderId
              ? {
                  custom: { index, reducedMotion },
                  variants: LIST_ITEM_MOTION_VARIANTS,
                  initial: 'hidden',
                  animate: 'visible',
                }
              : {})}
            className={`${FEY_GLASS_CARD_CLASS} p-4`}
          >
            {draft.isEditing ? (
              <>
                <div className="grid items-center gap-3 lg:grid-cols-[150px_minmax(220px,1.4fr)_minmax(220px,1.2fr)_auto]">
                  <ProviderKindPicker
                    value={draft.kind}
                    onChange={(kind) =>
                      onChange(draft.draftId, {
                        kind,
                        baseUrl: defaultBaseUrl(kind),
                      })
                    }
                  />
                  <TextInput
                    value={draft.baseUrl}
                    placeholder={defaultBaseUrl(draft.kind)}
                    onChange={(value) => onChange(draft.draftId, { baseUrl: value })}
                  />
                  <TextInput
                    value={draft.token}
                    type="password"
                    placeholder={draft.hasToken ? '保存済み。変更時のみ入力' : 'Access token'}
                    onChange={(value) => onChange(draft.draftId, { token: value })}
                  />
                  <div className="flex gap-2">
                    <IconButton
                      label="Test provider"
                      disabled={
                        draft.busy ||
                        !draft.baseUrl.trim() ||
                        (!draft.hasToken && !draft.token.trim())
                      }
                      onClick={() => onTest(draft)}
                    >
                      <TestTube2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                    <PrimaryIconButton
                      label="Save provider"
                      disabled={
                        draft.busy ||
                        !draft.baseUrl.trim() ||
                        (!draft.hasToken && !draft.token.trim())
                      }
                      onClick={() => onSave(draft)}
                    >
                      <Save className="h-4 w-4" aria-hidden="true" />
                    </PrimaryIconButton>
                  </div>
                </div>
                <RowMessage error={draft.error} message={draft.message} />
              </>
            ) : (
              <div className="grid items-center gap-3 lg:grid-cols-[150px_minmax(220px,1.4fr)_minmax(220px,1.2fr)_auto]">
                <p className="min-w-0 text-sm font-medium text-white lg:col-span-2">
                  <span className="truncate">
                    {draft.kind === 'github' ? 'GitHub' : 'GitLab'}(
                    {hostLabelFromBaseUrl(draft.baseUrl)})
                  </span>
                </p>
                <p className="text-sm text-[#a8b0b8]">
                  {draft.hasToken ? 'Token 保存済み' : 'Token 未設定'}
                </p>
                <div className="flex gap-2">
                  <IconButton
                    label="Edit provider"
                    onClick={() =>
                      onChange(draft.draftId, {
                        isEditing: true,
                        error: null,
                        message: null,
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            )}
          </motion.div>
        ))}
        {!hasUnsavedDraft ? <ProviderAddButton layoutId={addLayoutId} onClick={onAdd} /> : null}
      </motion.div>
    </section>
  );
}

function ProviderAddButton({ layoutId, onClick }: { layoutId: string; onClick: () => void }) {
  return (
    <div className="flex min-h-[104px] items-center justify-center rounded-2xl border border-dashed border-white/[0.12] bg-black/[0.08]">
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
        Provider
      </motion.button>
    </div>
  );
}
