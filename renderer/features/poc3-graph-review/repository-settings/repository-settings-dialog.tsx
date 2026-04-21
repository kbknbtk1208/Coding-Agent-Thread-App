'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FolderOpen, Pencil, Plus, RefreshCw, Save, TestTube2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProviderKind,
  ResolveRepositoryProviderResult,
} from '../../../../shared/poc3-domain/repository';
import { ProviderKindPicker } from './provider-kind-picker';

const SETTINGS_LAYOUT_ID = 'poc3-repository-settings-surface';
const FEY_GLASS_CARD_CLASS =
  'rounded-2xl border border-white/[0.08] bg-[#131313]/85 shadow-[0_0_44px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-26px_46px_rgba(0,0,0,0.34)] backdrop-blur-[6px]';

interface RepositorySettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ProviderDraft {
  draftId: string;
  repositoryProviderId?: string;
  layoutId: string;
  kind: RepositoryProviderKind;
  baseUrl: string;
  token: string;
  hasToken: boolean;
  isDefaultForKind: boolean;
  isEditing: boolean;
  message: string | null;
  error: string | null;
  busy: boolean;
}

interface ProfileDraft {
  draftId: string;
  repositoryProfileId?: string;
  repositoryProviderId: string;
  originUrl: string;
  localClonePath: string;
  worktreeRootPath: string;
  setupScriptText: string;
  resolution: ResolveRepositoryProviderResult | null;
  lastAutoWorktreePath: string;
  message: string | null;
  error: string | null;
  busy: boolean;
}

function createDraftId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultBaseUrl(kind: RepositoryProviderKind): string {
  return kind === 'github' ? 'https://github.com' : 'https://gitlab.com';
}

function providerAddLayoutId(index: number): string {
  return `poc3-provider-add-${index}`;
}

function newProviderDraft(index: number): ProviderDraft {
  return {
    draftId: createDraftId('provider'),
    layoutId: providerAddLayoutId(index),
    kind: 'github',
    baseUrl: 'https://github.com',
    token: '',
    hasToken: false,
    isDefaultForKind: true,
    isEditing: true,
    message: null,
    error: null,
    busy: false,
  };
}

function newProfileDraft(): ProfileDraft {
  return {
    draftId: createDraftId('profile'),
    repositoryProviderId: '',
    originUrl: '',
    localClonePath: '',
    worktreeRootPath: '',
    setupScriptText: '',
    resolution: null,
    lastAutoWorktreePath: '',
    message: null,
    error: null,
    busy: false,
  };
}

function providerToDraft(provider: PublicRepositoryProvider): ProviderDraft {
  return {
    draftId: provider.repositoryProviderId,
    repositoryProviderId: provider.repositoryProviderId,
    layoutId: `poc3-provider-card-${provider.repositoryProviderId}`,
    kind: provider.kind,
    baseUrl: provider.baseUrl,
    token: '',
    hasToken: provider.hasToken,
    isDefaultForKind: provider.isDefaultForKind,
    isEditing: false,
    message: null,
    error: null,
    busy: false,
  };
}

function profileToDraft(profile: RepositoryProfile): ProfileDraft {
  return {
    draftId: profile.repositoryProfileId,
    repositoryProfileId: profile.repositoryProfileId,
    repositoryProviderId: profile.repositoryProviderId,
    originUrl: profile.originUrl,
    localClonePath: profile.localClonePath,
    worktreeRootPath: profile.worktreeRootPath,
    setupScriptText: profile.setupScript?.scriptText ?? '',
    resolution: null,
    lastAutoWorktreePath: '',
    message: null,
    error: null,
    busy: false,
  };
}

function getAutoWorktreePath(localClonePath: string): string {
  const trimmed = localClonePath.trim().replace(/[\\/]+$/, '');
  if (!trimmed) {
    return '';
  }
  const separator = trimmed.includes('\\') ? '\\' : '/';
  const index = Math.max(trimmed.lastIndexOf('\\'), trimmed.lastIndexOf('/'));
  if (index === -1) {
    return `${trimmed}_worktree`;
  }
  return `${trimmed.slice(0, index)}${separator}${trimmed.slice(index + 1)}_worktree`;
}

function hostLabelFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).hostname.toLowerCase();
  } catch {
    return baseUrl.trim();
  }
}

function providerDisplayName(draft: Pick<ProviderDraft, 'kind' | 'baseUrl'>): string {
  return hostLabelFromBaseUrl(draft.baseUrl) || (draft.kind === 'github' ? 'GitHub' : 'GitLab');
}

function providerOptionLabel(provider: Pick<PublicRepositoryProvider, 'kind' | 'baseUrl'>): string {
  const host = hostLabelFromBaseUrl(provider.baseUrl);
  return host ? `${provider.kind} / ${host}` : provider.kind;
}

function resolutionText(resolution: ResolveRepositoryProviderResult | null): string {
  if (!resolution) {
    return 'origin URL を入力すると Provider 候補を解決します。';
  }
  if (resolution.status === 'resolved') {
    return 'Provider を自動解決しました。';
  }
  return resolution.message ?? 'Provider 解決結果を確認してください。';
}

function upsertProfile(
  profiles: RepositoryProfile[],
  profile: RepositoryProfile,
): RepositoryProfile[] {
  const exists = profiles.some(
    (candidate) => candidate.repositoryProfileId === profile.repositoryProfileId,
  );
  if (!exists) {
    return [profile, ...profiles];
  }
  return profiles.map((candidate) =>
    candidate.repositoryProfileId === profile.repositoryProfileId ? profile : candidate,
  );
}

function isEmptyNewProfileDraft(draft: ProfileDraft): boolean {
  return (
    !draft.repositoryProfileId &&
    !draft.originUrl.trim() &&
    !draft.localClonePath.trim() &&
    !draft.worktreeRootPath.trim() &&
    !draft.setupScriptText.trim()
  );
}

export { SETTINGS_LAYOUT_ID };

export function RepositorySettingsDialog({ open, onClose }: RepositorySettingsDialogProps) {
  const [providers, setProviders] = useState<PublicRepositoryProvider[]>([]);
  const [profiles, setProfiles] = useState<RepositoryProfile[]>([]);
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraft[]>([]);
  const [profileDrafts, setProfileDrafts] = useState<ProfileDraft[]>([newProfileDraft()]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.repositoryProviderId, provider])),
    [providers],
  );

  const reload = async () => {
    try {
      setLoadError(null);
      const [providerResult, profileResult] = await Promise.all([
        window.poc3GraphReviewApi.listRepositoryProviders(),
        window.poc3GraphReviewApi.listRepositoryProfiles(),
      ]);
      setProviders(providerResult.providers);
      setProfiles(profileResult.profiles);
      setProviderDrafts(providerResult.providers.map(providerToDraft));
      setProfileDrafts([...profileResult.profiles.map(profileToDraft), newProfileDraft()]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Repository settings を読み込めません。');
    }
  };

  const reloadProviders = async () => {
    const providerResult = await window.poc3GraphReviewApi.listRepositoryProviders();
    setProviders(providerResult.providers);
    setProviderDrafts(providerResult.providers.map(providerToDraft));
  };

  useEffect(() => {
    if (open) {
      void reload();
    }
  }, [open]);

  const updateProviderDraft = (draftId: string, patch: Partial<ProviderDraft>) => {
    setProviderDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
  };

  const updateProfileDraft = (draftId: string, patch: Partial<ProfileDraft>) => {
    setProfileDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
  };

  const resolveProfileProvider = async (draft: ProfileDraft) => {
    if (!draft.originUrl.trim()) {
      updateProfileDraft(draft.draftId, { resolution: null, repositoryProviderId: '' });
      return;
    }
    try {
      const resolution = await window.poc3GraphReviewApi.resolveRepositoryProvider({
        originUrl: draft.originUrl,
      });
      const repositoryProviderId =
        draft.repositoryProviderId || resolution.candidates[0]?.repositoryProviderId || '';
      updateProfileDraft(draft.draftId, {
        resolution,
        repositoryProviderId,
        message: resolutionText(resolution),
        error: null,
      });
    } catch (err) {
      updateProfileDraft(draft.draftId, {
        error: err instanceof Error ? err.message : 'Provider 解決に失敗しました。',
      });
    }
  };

  const saveProvider = async (draft: ProviderDraft) => {
    updateProviderDraft(draft.draftId, { busy: true, error: null, message: null });
    try {
      await window.poc3GraphReviewApi.saveRepositoryProvider({
        provider: {
          repositoryProviderId: draft.repositoryProviderId,
          kind: draft.kind,
          displayName: providerDisplayName(draft),
          baseUrl: draft.baseUrl,
          token: draft.token,
          isDefaultForKind: draft.isDefaultForKind,
        },
      });
      await reloadProviders();
    } catch (err) {
      updateProviderDraft(draft.draftId, {
        error: err instanceof Error ? err.message : 'Provider を保存できません。',
      });
    } finally {
      updateProviderDraft(draft.draftId, { busy: false });
    }
  };

  const testProvider = async (draft: ProviderDraft) => {
    updateProviderDraft(draft.draftId, { busy: true, error: null, message: null });
    try {
      const response = await window.poc3GraphReviewApi.testRepositoryProvider({
        provider: {
          repositoryProviderId: draft.repositoryProviderId,
          kind: draft.kind,
          displayName: providerDisplayName(draft),
          baseUrl: draft.baseUrl,
          token: draft.token,
          isDefaultForKind: draft.isDefaultForKind,
        },
      });
      updateProviderDraft(draft.draftId, {
        message: response.result.message,
        error: response.result.ok ? null : response.result.message,
      });
    } catch (err) {
      updateProviderDraft(draft.draftId, {
        error: err instanceof Error ? err.message : 'Provider 接続確認に失敗しました。',
      });
    } finally {
      updateProviderDraft(draft.draftId, { busy: false });
    }
  };

  const browseDirectory = async (
    draft: ProfileDraft,
    field: 'localClonePath' | 'worktreeRootPath',
  ) => {
    const result = await window.poc3GraphReviewApi.browseDirectory({
      title: field === 'localClonePath' ? 'local clone path を選択' : 'worktree root path を選択',
      defaultPath: draft[field] || undefined,
    });
    if (result.canceled || !result.path) {
      return;
    }
    if (field === 'localClonePath') {
      const autoWorktreePath = getAutoWorktreePath(result.path);
      updateProfileDraft(draft.draftId, {
        localClonePath: result.path,
        worktreeRootPath:
          !draft.worktreeRootPath || draft.worktreeRootPath === draft.lastAutoWorktreePath
            ? autoWorktreePath
            : draft.worktreeRootPath,
        lastAutoWorktreePath: autoWorktreePath,
      });
      return;
    }
    updateProfileDraft(draft.draftId, { worktreeRootPath: result.path });
  };

  const ensureProviderForDraft = async (draft: ProfileDraft): Promise<string> => {
    if (draft.repositoryProviderId) {
      return draft.repositoryProviderId;
    }
    if (!draft.originUrl.trim()) {
      return '';
    }
    const resolution = await window.poc3GraphReviewApi.resolveRepositoryProvider({
      originUrl: draft.originUrl,
    });
    const repositoryProviderId = resolution.candidates[0]?.repositoryProviderId ?? '';
    updateProfileDraft(draft.draftId, {
      resolution,
      repositoryProviderId,
      message: resolutionText(resolution),
      error: repositoryProviderId ? null : (resolution.message ?? 'Provider を解決できません。'),
    });
    return repositoryProviderId;
  };

  const profilePayload = (
    draft: ProfileDraft,
    repositoryProviderId: string,
    allowOriginMismatch = false,
  ) => ({
    repositoryProfileId: draft.repositoryProfileId,
    repositoryProviderId,
    originUrl: draft.originUrl,
    localClonePath: draft.localClonePath,
    worktreeRootPath: draft.worktreeRootPath,
    allowOriginMismatch,
    setupScript: draft.setupScriptText.trim()
      ? {
          scriptText: draft.setupScriptText,
          shell: 'powershell' as const,
          cwdMode: 'worktreePath' as const,
        }
      : null,
  });

  const validateProfile = async (draft: ProfileDraft) => {
    updateProfileDraft(draft.draftId, { busy: true, error: null, message: null });
    try {
      const repositoryProviderId = await ensureProviderForDraft(draft);
      const response = await window.poc3GraphReviewApi.validateRepositoryProfile({
        profile: profilePayload(draft, repositoryProviderId),
      });
      const firstIssue = response.result.issues[0];
      updateProfileDraft(draft.draftId, {
        message: response.result.ok
          ? 'Repository Profile を保存できます。'
          : (firstIssue?.message ?? 'Repository Profile を確認してください。'),
        error: response.result.ok ? null : (firstIssue?.message ?? null),
      });
    } catch (err) {
      updateProfileDraft(draft.draftId, {
        error: err instanceof Error ? err.message : 'Repository Profile の検証に失敗しました。',
      });
    } finally {
      updateProfileDraft(draft.draftId, { busy: false });
    }
  };

  const saveProfile = async (draft: ProfileDraft) => {
    updateProfileDraft(draft.draftId, { busy: true, error: null, message: null });
    try {
      const repositoryProviderId = await ensureProviderForDraft(draft);
      const validation = await window.poc3GraphReviewApi.validateRepositoryProfile({
        profile: profilePayload(draft, repositoryProviderId),
      });
      const blockingIssue = validation.result.issues.find(
        (issue) => issue.severity === 'error' && issue.code !== 'ORIGIN_MISMATCH',
      );
      if (blockingIssue) {
        throw new Error(blockingIssue.message);
      }
      const hasOriginMismatch = validation.result.issues.some(
        (issue) => issue.code === 'ORIGIN_MISMATCH',
      );
      const allowOriginMismatch =
        hasOriginMismatch &&
        window.confirm(
          '入力された origin URL と local clone の remote origin が一致しません。このまま保存しますか？',
        );
      if (!validation.result.ok && !allowOriginMismatch) {
        const firstIssue = validation.result.issues[0];
        throw new Error(firstIssue?.message ?? 'Repository Profile を保存できません。');
      }
      const response = await window.poc3GraphReviewApi.saveRepositoryProfile({
        profile: profilePayload(draft, repositoryProviderId, allowOriginMismatch),
      });
      setProfiles((current) => upsertProfile(current, response.profile));
      setProfileDrafts((current) => {
        const replaced = current.map((candidate) =>
          candidate.draftId === draft.draftId ? profileToDraft(response.profile) : candidate,
        );
        return replaced.some(isEmptyNewProfileDraft) ? replaced : [...replaced, newProfileDraft()];
      });
    } catch (err) {
      updateProfileDraft(draft.draftId, {
        error: err instanceof Error ? err.message : 'Repository Profile を保存できません。',
      });
    } finally {
      updateProfileDraft(draft.draftId, { busy: false });
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="poc3-settings-backdrop"
            className="fixed inset-0 z-[60] bg-black/24 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8">
            <motion.div
              layoutId={SETTINGS_LAYOUT_ID}
              className="max-h-[calc(100vh-2rem)] w-[min(96vw,1120px)] rounded-2xl bg-[linear-gradient(210deg,rgba(255,255,255,0.22)_6.2%,rgba(20,20,20,0.5)_21.56%,rgba(50,50,50,0.5)_69.03%,rgba(255,255,255,0.4)_96.99%)] p-px shadow-[0_0_44px_rgba(0,0,0,0.8)]"
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="poc3-repository-settings-title"
                className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl bg-[#131313]/35 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-34px_70px_rgba(0,0,0,0.2)] backdrop-blur-[16px]"
              >
                <DialogHeader onClose={onClose} />
                <div className="space-y-6 p-5">
                  {loadError ? <Message tone="error">{loadError}</Message> : null}
                  <ProviderSection
                    drafts={providerDrafts}
                    onAdd={() =>
                      setProviderDrafts((current) =>
                        current.some((draft) => !draft.repositoryProviderId)
                          ? current
                          : [...current, newProviderDraft(current.length)],
                      )
                    }
                    onChange={updateProviderDraft}
                    onSave={(draft) => void saveProvider(draft)}
                    onTest={(draft) => void testProvider(draft)}
                  />
                  <RepositorySection
                    drafts={profileDrafts}
                    providers={providers}
                    providerById={providerById}
                    profiles={profiles}
                    onAdd={() => setProfileDrafts((current) => [...current, newProfileDraft()])}
                    onChange={updateProfileDraft}
                    onResolve={(draft) => void resolveProfileProvider(draft)}
                    onBrowse={(draft, field) => void browseDirectory(draft, field)}
                    onValidate={(draft) => void validateProfile(draft)}
                    onSave={(draft) => void saveProfile(draft)}
                  />
                </div>
              </section>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function DialogHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.06] bg-[#131313]/38 px-5 py-4 shadow-[0_16px_34px_rgba(0,0,0,0.2)] backdrop-blur-[18px]">
      <div>
        <h2 id="poc3-repository-settings-title" className="text-xl font-semibold text-white">
          Repository settings
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-white/[0.12] bg-white/[0.06] p-2 text-white transition hover:bg-white/[0.1]"
        aria-label="Close repository settings"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function Message({ children, tone }: { children: React.ReactNode; tone: 'error' | 'info' }) {
  const className =
    tone === 'error'
      ? 'border-[#ff5c5c]/25 bg-[#ff5c5c]/10 text-[#ffd1d1]'
      : 'border-[#d8e071]/25 bg-[#d8e071]/10 text-[#f3f6c2]';
  return <div className={`rounded-lg border px-4 py-3 text-sm ${className}`}>{children}</div>;
}

interface ProviderSectionProps {
  drafts: ProviderDraft[];
  onAdd: () => void;
  onChange: (draftId: string, patch: Partial<ProviderDraft>) => void;
  onSave: (draft: ProviderDraft) => void;
  onTest: (draft: ProviderDraft) => void;
}

function ProviderSection({ drafts, onAdd, onChange, onSave, onTest }: ProviderSectionProps) {
  const hasUnsavedDraft = drafts.some((draft) => !draft.repositoryProviderId);
  const addLayoutId = providerAddLayoutId(drafts.length);

  return (
    <section className="space-y-3">
      <SectionTitle title="Provider" />
      <motion.div layout className="space-y-3">
        {drafts.map((draft) => (
          <motion.div
            key={draft.draftId}
            layout
            layoutId={draft.layoutId}
            className={`${FEY_GLASS_CARD_CLASS} p-4`}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
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
                      onChange(draft.draftId, { isEditing: true, error: null, message: null })
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

function SectionTitle({ title }: { title: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
    </div>
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
        className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.12] px-4 text-sm font-medium text-white transition hover:border-[#d8e071]/35"
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Provider
      </motion.button>
    </div>
  );
}

interface RepositorySectionProps {
  drafts: ProfileDraft[];
  providers: PublicRepositoryProvider[];
  providerById: Map<string, PublicRepositoryProvider>;
  profiles: RepositoryProfile[];
  onAdd: () => void;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
  onResolve: (draft: ProfileDraft) => void;
  onBrowse: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  onValidate: (draft: ProfileDraft) => void;
  onSave: (draft: ProfileDraft) => void;
}

function RepositorySection({
  drafts,
  providers,
  providerById,
  profiles,
  onAdd,
  onChange,
  onResolve,
  onBrowse,
  onValidate,
  onSave,
}: RepositorySectionProps) {
  return (
    <section className="space-y-3">
      <SectionHeader title="Repository" buttonLabel="Repository" onAdd={onAdd} />
      {providers.length === 0 ? (
        <Message tone="info">Repository を登録する前に Provider を追加してください。</Message>
      ) : null}
      <div className="space-y-3">
        {drafts.map((draft) => (
          <RepositoryDraftRow
            key={draft.draftId}
            draft={draft}
            providers={providers}
            providerById={providerById}
            isSaved={profiles.some(
              (profile) => profile.repositoryProfileId === draft.repositoryProfileId,
            )}
            onChange={onChange}
            onResolve={onResolve}
            onBrowse={onBrowse}
            onValidate={onValidate}
            onSave={onSave}
          />
        ))}
      </div>
    </section>
  );
}

interface RepositoryDraftRowProps {
  draft: ProfileDraft;
  providers: PublicRepositoryProvider[];
  providerById: Map<string, PublicRepositoryProvider>;
  isSaved: boolean;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
  onResolve: (draft: ProfileDraft) => void;
  onBrowse: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  onValidate: (draft: ProfileDraft) => void;
  onSave: (draft: ProfileDraft) => void;
}

function RepositoryDraftRow({
  draft,
  providers,
  providerById,
  isSaved,
  onChange,
  onResolve,
  onBrowse,
  onValidate,
  onSave,
}: RepositoryDraftRowProps) {
  const candidateProviders = draft.resolution?.candidates ?? [];
  const selectableProviders = draft.resolution ? candidateProviders : providers;
  const selectedProvider = providerById.get(draft.repositoryProviderId);

  return (
    <div className={`${FEY_GLASS_CARD_CLASS} p-4`}>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_220px]">
        <LabeledInput
          label="originUrl"
          value={draft.originUrl}
          placeholder="https://github.com/owner/repo または git@gitlab.com:group/project.git"
          onBlur={() => onResolve(draft)}
          onChange={(value) =>
            onChange(draft.draftId, { originUrl: value, error: null, message: null })
          }
        />
        <div>
          <Label>resolved provider</Label>
          <select
            value={draft.repositoryProviderId}
            onChange={(event) =>
              onChange(draft.draftId, { repositoryProviderId: event.target.value })
            }
            className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition focus:border-[#d8e071]/45"
          >
            <option value="">Provider を選択</option>
            {selectableProviders.map((provider) => (
              <option key={provider.repositoryProviderId} value={provider.repositoryProviderId}>
                {providerOptionLabel(provider)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mt-2 text-xs text-[#a8b0b8]">
        {selectedProvider
          ? `${selectedProvider.kind} / ${selectedProvider.baseUrl}`
          : resolutionText(draft.resolution)}
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PathInput
          label="localClonePath"
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
          label="worktreeRootPath"
          value={draft.worktreeRootPath}
          placeholder="C:\\Users\\nkubo\\Dev\\my-repo_worktree"
          onChange={(value) => onChange(draft.draftId, { worktreeRootPath: value })}
          onBrowse={() => onBrowse(draft, 'worktreeRootPath')}
        />
      </div>
      <div className="mt-4">
        <Label>setupScript</Label>
        <textarea
          value={draft.setupScriptText}
          onChange={(event) => onChange(draft.draftId, { setupScriptText: event.target.value })}
          className="mt-1 min-h-[92px] w-full resize-y rounded-lg border border-white/[0.12] bg-black/30 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
          placeholder={'npm install;\nnpx prisma generate;'}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-h-5 text-sm">
          {draft.error || draft.message ? (
            <span className={draft.error ? 'text-[#ffb4b4]' : 'text-[#cfd78a]'}>
              {draft.error ?? draft.message}
            </span>
          ) : (
            <span className="text-[#8e98a4]">
              {isSaved ? '保存済み profile を編集できます。' : '入力後に検証して保存してください。'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <SecondaryButton onClick={() => onResolve(draft)}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Resolve
          </SecondaryButton>
          <SecondaryButton disabled={draft.busy} onClick={() => onValidate(draft)}>
            Validate
          </SecondaryButton>
          <PrimaryButton disabled={draft.busy} onClick={() => onSave(draft)}>
            Save
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  description,
  buttonLabel,
  onAdd,
}: {
  title: string;
  description?: string;
  buttonLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {description ? <p className="mt-1 text-sm text-[#a8b0b8]">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-[#d8e071]/35"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {buttonLabel}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium uppercase tracking-[0.14em] text-[#8e98a4]">
      {children}
    </label>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
  type = 'text',
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <input
      value={value}
      type={type}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
      placeholder={placeholder}
    />
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        value={value}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
        placeholder={placeholder}
      />
    </div>
  );
}

interface PathInputProps {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
}

function PathInput({ label, value, placeholder, onChange, onBrowse }: PathInputProps) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex gap-2">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={onBrowse}
          className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35"
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          参照
        </button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 items-center justify-center rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#479ffa]/35 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PrimaryIconButton(props: Parameters<typeof IconButton>[0]) {
  return (
    <button
      type="button"
      aria-label={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="flex h-10 items-center justify-center rounded-lg bg-[#d8e071] px-3 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:opacity-50"
    >
      {props.children}
    </button>
  );
}

function SecondaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-white/[0.12] px-3 py-2 text-sm text-white transition hover:border-[#479ffa]/35 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  disabled,
  onClick,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-[#d8e071] px-3 py-2 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function RowMessage({ error, message }: { error: string | null; message: string | null }) {
  if (!error && !message) {
    return null;
  }
  return (
    <p className={`mt-3 text-sm ${error ? 'text-[#ffb4b4]' : 'text-[#cfd78a]'}`}>
      {error ?? message}
    </p>
  );
}
