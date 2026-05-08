import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicRepositoryProvider } from '../../../../shared/poc3-domain/repository';
import {
  createDraftId,
  getAutoWorktreePath,
  isEmptyNewProfileDraft,
  isProviderResolutionFailure,
  isSameProfileDraftInput,
  newProfileDraft,
  newProviderDraft,
  profilePayload,
  profileToDraft,
  providerDisplayName,
  providerToDraft,
  resolutionText,
  type ProfileDraft,
  type ProviderDraft,
} from './repository-draft-helpers';
import {
  browserRepositorySettingsApi,
  type RepositorySettingsApi,
} from './repository-settings-api';
import type { ResolveProviderRequest } from './use-debounced-resolve-provider';

export interface RepositorySettingsState {
  providers: PublicRepositoryProvider[];
  providerDrafts: ProviderDraft[];
  profileDrafts: ProfileDraft[];
  providerById: Map<string, PublicRepositoryProvider>;
  loadError: string | null;
  confirmMismatch: {
    requestId: string;
    message: string;
    detail?: string;
  } | null;
  reload: () => void;
  addProviderDraft: () => void;
  updateProviderDraft: (draftId: string, patch: Partial<ProviderDraft>) => void;
  saveProvider: (draft: ProviderDraft) => void;
  testProvider: (draft: ProviderDraft) => void;
  addProfileDraft: () => void;
  updateProfileDraft: (draftId: string, patch: Partial<ProfileDraft>) => void;
  resolveProfileProvider: (request: ResolveProviderRequest) => void;
  browseDirectory: (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => void;
  validateProfile: (draft: ProfileDraft) => void;
  saveProfile: (draft: ProfileDraft) => void;
  resolveConfirmMismatch: (confirmed: boolean) => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useRepositorySettings(
  api: RepositorySettingsApi = browserRepositorySettingsApi,
): RepositorySettingsState {
  const [providers, setProviders] = useState<PublicRepositoryProvider[]>([]);
  const [providerDrafts, setProviderDrafts] = useState<ProviderDraft[]>([]);
  const [profileDrafts, setProfileDrafts] = useState<ProfileDraft[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmMismatch, setConfirmMismatch] = useState<{
    requestId: string;
    message: string;
    detail?: string;
  } | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const activeProfileSaveRef = useRef<Set<string>>(new Set());
  const profileSaveInFlightRef = useRef(false);
  const profileDraftsRef = useRef<ProfileDraft[]>([]);

  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.repositoryProviderId, provider])),
    [providers],
  );

  useEffect(() => {
    profileDraftsRef.current = profileDrafts;
  }, [profileDrafts]);

  const isProfileDraftStillCurrent = useCallback((snapshot: ProfileDraft): boolean => {
    const current = profileDraftsRef.current.find((draft) => draft.draftId === snapshot.draftId);
    return current ? isSameProfileDraftInput(current, snapshot) : false;
  }, []);

  const updateProviderDraft = useCallback((draftId: string, patch: Partial<ProviderDraft>) => {
    setProviderDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
  }, []);

  const updateProfileDraft = useCallback((draftId: string, patch: Partial<ProfileDraft>) => {
    setProfileDrafts((current) =>
      current.map((draft) => (draft.draftId === draftId ? { ...draft, ...patch } : draft)),
    );
  }, []);

  const reloadProviders = useCallback(async () => {
    const providerResult = await api.listProviders();
    setProviders(providerResult.providers);
    setProviderDrafts(providerResult.providers.map(providerToDraft));
  }, [api]);

  const reload = useCallback(() => {
    void (async () => {
      try {
        setLoadError(null);
        const [providerResult, profileResult] = await Promise.all([
          api.listProviders(),
          api.listProfiles(),
        ]);
        setProviders(providerResult.providers);
        setProviderDrafts(providerResult.providers.map(providerToDraft));
        setProfileDrafts(profileResult.profiles.map(profileToDraft));
      } catch (err) {
        setLoadError(errorMessage(err, 'Repository settings を読み込めません。'));
      }
    })();
  }, [api]);

  const addProviderDraft = useCallback(() => {
    setProviderDrafts((current) =>
      current.some((draft) => !draft.repositoryProviderId)
        ? current
        : [...current, newProviderDraft(current.length)],
    );
  }, []);

  const addProfileDraft = useCallback(() => {
    setProfileDrafts((current) =>
      current.some((draft) => !draft.repositoryProfileId)
        ? current
        : [...current, newProfileDraft(current.length)],
    );
  }, []);

  const updateProfileDraftIfUnchanged = useCallback(
    (snapshot: ProfileDraft, patch: Partial<ProfileDraft>) => {
      setProfileDrafts((current) =>
        current.map((candidate) =>
          isSameProfileDraftInput(candidate, snapshot) ? { ...candidate, ...patch } : candidate,
        ),
      );
    },
    [],
  );

  const resolveProfileProvider = useCallback(
    (request: ResolveProviderRequest) => {
      const originUrl = request.originUrl.trim();
      if (!originUrl) {
        updateProfileDraft(request.draftId, {
          resolution: null,
          repositoryProviderId: '',
          isResolvingProvider: false,
        });
        return;
      }
      updateProfileDraft(request.draftId, { isResolvingProvider: true });
      void (async () => {
        try {
          const resolution = await api.resolveProvider({ originUrl });
          const isFailure = isProviderResolutionFailure(resolution);
          setProfileDrafts((current) =>
            current.map((candidate) => {
              if (
                candidate.draftId !== request.draftId ||
                candidate.originUrl.trim() !== originUrl
              ) {
                return candidate;
              }
              return {
                ...candidate,
                resolution,
                repositoryProviderId: isFailure
                  ? ''
                  : resolution.candidates[0]?.repositoryProviderId || '',
                message: null,
                error: isFailure ? (resolution.message ?? 'Provider を解決できません。') : null,
                isResolvingProvider: false,
              };
            }),
          );
        } catch (err) {
          setProfileDrafts((current) =>
            current.map((candidate) => {
              if (
                candidate.draftId !== request.draftId ||
                candidate.originUrl.trim() !== originUrl
              ) {
                return candidate;
              }
              return {
                ...candidate,
                error: errorMessage(err, 'Provider 解決に失敗しました。'),
                isResolvingProvider: false,
              };
            }),
          );
        }
      })();
    },
    [api, updateProfileDraft],
  );

  const saveProvider = useCallback(
    (draft: ProviderDraft) => {
      updateProviderDraft(draft.draftId, { busy: true, error: null, message: null });
      void (async () => {
        try {
          await api.saveProvider({
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
            error: errorMessage(err, 'Provider を保存できません。'),
          });
        } finally {
          updateProviderDraft(draft.draftId, { busy: false });
        }
      })();
    },
    [api, reloadProviders, updateProviderDraft],
  );

  const testProvider = useCallback(
    (draft: ProviderDraft) => {
      updateProviderDraft(draft.draftId, { busy: true, error: null, message: null });
      void (async () => {
        try {
          const response = await api.testProvider({
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
            error: errorMessage(err, 'Provider 接続確認に失敗しました。'),
          });
        } finally {
          updateProviderDraft(draft.draftId, { busy: false });
        }
      })();
    },
    [api, updateProviderDraft],
  );

  const browseDirectory = useCallback(
    (draft: ProfileDraft, field: 'localClonePath' | 'worktreeRootPath') => {
      void (async () => {
        const result = await api.browseDirectory({
          title:
            field === 'localClonePath' ? 'local clone path を選択' : 'worktree root path を選択',
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
      })();
    },
    [api, updateProfileDraft],
  );

  const ensureProviderForDraft = useCallback(
    async (draft: ProfileDraft): Promise<string> => {
      if (draft.repositoryProviderId) {
        return draft.repositoryProviderId;
      }
      if (!draft.originUrl.trim()) {
        return '';
      }
      const originUrl = draft.originUrl.trim();
      const resolution = await api.resolveProvider({ originUrl });
      const isFailure = isProviderResolutionFailure(resolution);
      const repositoryProviderId = isFailure
        ? ''
        : (resolution.candidates[0]?.repositoryProviderId ?? '');
      setProfileDrafts((current) =>
        current.map((candidate) =>
          candidate.draftId === draft.draftId && candidate.originUrl.trim() === originUrl
            ? {
                ...candidate,
                resolution,
                repositoryProviderId,
                message: resolutionText(resolution),
                error: repositoryProviderId
                  ? null
                  : (resolution.message ?? 'Provider を解決できません。'),
              }
            : candidate,
        ),
      );
      return repositoryProviderId;
    },
    [api],
  );

  const validateProfile = useCallback(
    (draft: ProfileDraft) => {
      updateProfileDraft(draft.draftId, { busy: true, error: null, message: null });
      void (async () => {
        try {
          const repositoryProviderId = await ensureProviderForDraft(draft);
          const response = await api.validateProfile({
            profile: profilePayload(draft, repositoryProviderId),
          });
          const firstIssue = response.result.issues[0];
          updateProfileDraftIfUnchanged(draft, {
            message: response.result.ok
              ? 'Repository Profile を保存できます。'
              : (firstIssue?.message ?? 'Repository Profile を確認してください。'),
            error: response.result.ok ? null : (firstIssue?.message ?? null),
          });
        } catch (err) {
          updateProfileDraftIfUnchanged(draft, {
            error: errorMessage(err, 'Repository Profile の検証に失敗しました。'),
          });
        } finally {
          updateProfileDraft(draft.draftId, { busy: false });
        }
      })();
    },
    [api, ensureProviderForDraft, updateProfileDraft, updateProfileDraftIfUnchanged],
  );

  const askConfirmOriginMismatch = useCallback(
    (params: { message: string; detail?: string }): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        confirmResolveRef.current?.(false);
        confirmResolveRef.current = resolve;
        setConfirmMismatch({
          requestId: createDraftId('confirm'),
          message: params.message,
          detail: params.detail,
        });
      }),
    [],
  );

  const resolveConfirmMismatch = useCallback((confirmed: boolean) => {
    confirmResolveRef.current?.(confirmed);
    confirmResolveRef.current = null;
    setConfirmMismatch(null);
  }, []);

  const saveProfile = useCallback(
    (draft: ProfileDraft) => {
      if (
        profileSaveInFlightRef.current ||
        confirmResolveRef.current ||
        activeProfileSaveRef.current.has(draft.draftId)
      ) {
        return;
      }
      profileSaveInFlightRef.current = true;
      activeProfileSaveRef.current.add(draft.draftId);
      updateProfileDraft(draft.draftId, { busy: true, error: null, message: null });
      void (async () => {
        try {
          const repositoryProviderId = await ensureProviderForDraft(draft);
          const validation = await api.validateProfile({
            profile: profilePayload(draft, repositoryProviderId),
          });
          const blockingIssue = validation.result.issues.find(
            (issue) => issue.severity === 'error' && issue.code !== 'ORIGIN_MISMATCH',
          );
          if (blockingIssue) {
            throw new Error(blockingIssue.message);
          }
          const originMismatchIssue = validation.result.issues.find(
            (issue) => issue.code === 'ORIGIN_MISMATCH',
          );
          const allowOriginMismatch = originMismatchIssue
            ? await askConfirmOriginMismatch({
                message:
                  '入力された origin URL と local clone の remote origin が一致しません。このまま保存しますか？',
                detail: originMismatchIssue.detail ?? originMismatchIssue.message,
              })
            : false;
          if (!validation.result.ok && !allowOriginMismatch) {
            const firstIssue = validation.result.issues[0];
            throw new Error(firstIssue?.message ?? 'Repository Profile を保存できません。');
          }
          if (!isProfileDraftStillCurrent(draft)) {
            throw new Error(
              '入力内容が変更されたため、保存を中止しました。もう一度保存してください。',
            );
          }
          const response = await api.saveProfile({
            profile: profilePayload(draft, repositoryProviderId, allowOriginMismatch),
          });
          setProfileDrafts((current) => {
            const replaced = current.map((candidate) =>
              isSameProfileDraftInput(candidate, draft)
                ? profileToDraft(response.profile)
                : candidate,
            );
            return replaced.filter((candidate) => !isEmptyNewProfileDraft(candidate));
          });
        } catch (err) {
          updateProfileDraftIfUnchanged(draft, {
            error: errorMessage(err, 'Repository Profile を保存できません。'),
          });
        } finally {
          profileSaveInFlightRef.current = false;
          activeProfileSaveRef.current.delete(draft.draftId);
          updateProfileDraft(draft.draftId, { busy: false });
        }
      })();
    },
    [
      api,
      askConfirmOriginMismatch,
      ensureProviderForDraft,
      isProfileDraftStillCurrent,
      updateProfileDraft,
      updateProfileDraftIfUnchanged,
    ],
  );

  useEffect(
    () => () => {
      confirmResolveRef.current?.(false);
      confirmResolveRef.current = null;
      profileSaveInFlightRef.current = false;
      activeProfileSaveRef.current.clear();
    },
    [],
  );

  return {
    providers,
    providerDrafts,
    profileDrafts,
    providerById,
    loadError,
    confirmMismatch,
    reload,
    addProviderDraft,
    updateProviderDraft,
    saveProvider,
    testProvider,
    addProfileDraft,
    updateProfileDraft,
    resolveProfileProvider,
    browseDirectory,
    validateProfile,
    saveProfile,
    resolveConfirmMismatch,
  };
}
