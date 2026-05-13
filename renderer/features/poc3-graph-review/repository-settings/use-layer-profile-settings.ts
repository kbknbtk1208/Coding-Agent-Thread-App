import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  GraphLayerDiagnostic,
  GraphLayerUnclassifiedDirectory,
  GraphLayerUnclassifiedSummary,
  RepositoryLayerIgnorePatternDraft,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
  RepositoryLayerRuleDraft,
} from '../../../../shared/poc3-domain/layer-profile';
import {
  browserRepositorySettingsApi,
  type RepositorySettingsApi,
} from './repository-settings-api';

export interface LayerProfileSettingsState {
  selectedRepositoryProfileId: string;
  draft: RepositoryLayerProfileDraft | null;
  source: 'stored' | 'same-repository-copy' | 'heuristic' | 'empty' | null;
  reusableProfile: RepositoryLayerProfile | null;
  diagnostics: GraphLayerDiagnostic[];
  previewSummary: GraphLayerUnclassifiedSummary | null;
  previewDiagnostics: GraphLayerDiagnostic[];
  violationEdgeIds: string[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  message: string | null;
  canPreview: boolean;
  setSelectedRepositoryProfileId: (repositoryProfileId: string) => void;
  reload: () => void;
  inferDraft: () => void;
  updateProfile: (patch: Partial<RepositoryLayerProfileDraft>) => void;
  updateRule: (index: number, patch: Partial<RepositoryLayerRuleDraft>) => void;
  addRule: (input?: Partial<RepositoryLayerRuleDraft>) => void;
  removeRule: (index: number) => void;
  updateIgnorePattern: (index: number, patch: Partial<RepositoryLayerIgnorePatternDraft>) => void;
  addIgnorePattern: (input?: Partial<RepositoryLayerIgnorePatternDraft>) => void;
  removeIgnorePattern: (index: number) => void;
  addRuleFromSuggestion: (suggestion: GraphLayerUnclassifiedDirectory, layerPath: string) => void;
  addIgnoreFromSuggestion: (suggestion: GraphLayerUnclassifiedDirectory) => void;
  preview: () => void;
  save: () => void;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function layerProfileToDraft(profile: RepositoryLayerProfile): RepositoryLayerProfileDraft {
  return {
    layerProfileId: profile.layerProfileId,
    repositoryProfileId: profile.repositoryProfileId,
    repositoryIdentityKey: profile.repositoryIdentityKey,
    schemaVersion: profile.schemaVersion,
    profileVersion: profile.profileVersion,
    displayName: profile.displayName,
    layoutDirection: profile.layoutDirection,
    dependencyDirection: profile.dependencyDirection,
    layoutStrategy: profile.layoutStrategy,
    rules: profile.rules.map((rule) => ({ ...rule })),
    ignoredPatterns: profile.ignoredPatterns.map((pattern) => ({ ...pattern })),
  };
}

export function createEmptyLayerProfileDraft(
  repositoryProfileId: string,
): RepositoryLayerProfileDraft {
  return {
    repositoryProfileId,
    schemaVersion: 1,
    displayName: 'Repository layers',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules: [],
    ignoredPatterns: [],
  };
}

export function createLayerRuleDraft(
  rules: RepositoryLayerRuleDraft[],
  input: Partial<RepositoryLayerRuleDraft> = {},
): RepositoryLayerRuleDraft {
  const nextOrder =
    rules.reduce((maxOrder, rule) => Math.max(maxOrder, Number(rule.order) || 0), 0) + 10;
  return {
    glob: input.glob ?? '',
    layerPath: input.layerPath ?? '',
    displayName: input.displayName ?? input.layerPath ?? '',
    description: input.description ?? null,
    order: input.order ?? nextOrder,
    priority: input.priority ?? 0,
    enabled: input.enabled ?? true,
    ...(input.layerRuleId ? { layerRuleId: input.layerRuleId } : {}),
  };
}

export function createIgnorePatternDraft(
  input: Partial<RepositoryLayerIgnorePatternDraft> = {},
): RepositoryLayerIgnorePatternDraft {
  return {
    glob: input.glob ?? '',
    reason: input.reason ?? null,
    enabled: input.enabled ?? true,
    ...(input.ignorePatternId ? { ignorePatternId: input.ignorePatternId } : {}),
  };
}

export function firstAvailableLayerPath(draft: RepositoryLayerProfileDraft | null): string {
  return draft?.rules.find((rule) => rule.enabled && rule.layerPath.trim())?.layerPath ?? '';
}

export function createLayerProfileDraftSignature(
  draft: RepositoryLayerProfileDraft | null,
): string {
  return draft ? JSON.stringify(draft) : '';
}

export function resolveSelectedRepositoryProfileId(input: {
  repositoryProfileIds: string[];
  selectedRepositoryProfileId: string;
  initialRepositoryProfileId?: string | null;
}): string {
  if (input.repositoryProfileIds.includes(input.selectedRepositoryProfileId)) {
    return input.selectedRepositoryProfileId;
  }
  if (
    input.initialRepositoryProfileId &&
    input.repositoryProfileIds.includes(input.initialRepositoryProfileId)
  ) {
    return input.initialRepositoryProfileId;
  }
  return input.repositoryProfileIds[0] ?? '';
}

export function useLayerProfileSettings({
  repositoryProfileIds,
  initialRepositoryProfileId = null,
  reviewWorkspaceId,
  api = browserRepositorySettingsApi,
}: {
  repositoryProfileIds: string[];
  initialRepositoryProfileId?: string | null;
  reviewWorkspaceId: string | null;
  api?: RepositorySettingsApi;
}): LayerProfileSettingsState {
  const [selectedRepositoryProfileId, setSelectedRepositoryProfileId] = useState('');
  const [draft, setDraft] = useState<RepositoryLayerProfileDraft | null>(null);
  const [source, setSource] = useState<LayerProfileSettingsState['source']>(null);
  const [reusableProfile, setReusableProfile] = useState<RepositoryLayerProfile | null>(null);
  const [diagnostics, setDiagnostics] = useState<GraphLayerDiagnostic[]>([]);
  const [previewSummary, setPreviewSummary] = useState<GraphLayerUnclassifiedSummary | null>(null);
  const [previewDiagnostics, setPreviewDiagnostics] = useState<GraphLayerDiagnostic[]>([]);
  const [violationEdgeIds, setViolationEdgeIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const draftSignature = useMemo(() => createLayerProfileDraftSignature(draft), [draft]);
  const draftSignatureRef = useRef(draftSignature);

  useEffect(() => {
    draftSignatureRef.current = draftSignature;
  }, [draftSignature]);

  const currentProfileId = useMemo(
    () =>
      resolveSelectedRepositoryProfileId({
        repositoryProfileIds,
        selectedRepositoryProfileId,
        initialRepositoryProfileId,
      }),
    [initialRepositoryProfileId, repositoryProfileIds, selectedRepositoryProfileId],
  );

  useEffect(() => {
    if (currentProfileId !== selectedRepositoryProfileId) {
      setSelectedRepositoryProfileId(currentProfileId);
    }
  }, [currentProfileId, selectedRepositoryProfileId]);

  const clearPreview = useCallback(() => {
    setPreviewSummary(null);
    setPreviewDiagnostics([]);
    setViolationEdgeIds([]);
  }, []);

  const load = useCallback(
    (mode: 'stored-or-infer' | 'infer') => {
      if (!currentProfileId) {
        setDraft(null);
        setSource(null);
        setReusableProfile(null);
        setDiagnostics([]);
        clearPreview();
        return;
      }
      const seq = requestSeqRef.current + 1;
      requestSeqRef.current = seq;
      setLoading(true);
      setError(null);
      setMessage(null);
      void (async () => {
        try {
          if (mode === 'stored-or-infer') {
            const loaded = await api.loadLayerProfile({
              repositoryProfileId: currentProfileId,
            });
            if (seq !== requestSeqRef.current) return;
            if (!loaded.ok) {
              throw new Error(loaded.message);
            }
            setReusableProfile(loaded.reusableProfile);
            if (loaded.profile) {
              setDraft(layerProfileToDraft(loaded.profile));
              setSource('stored');
              setDiagnostics([]);
              clearPreview();
              return;
            }
          }
          const inferred = await api.inferLayerProfile({
            repositoryProfileId: currentProfileId,
          });
          if (seq !== requestSeqRef.current) return;
          if (!inferred.ok) {
            throw new Error(inferred.message);
          }
          setDraft(inferred.draft);
          setSource(inferred.source);
          setDiagnostics(inferred.diagnostics);
          setReusableProfile(null);
          clearPreview();
        } catch (err) {
          if (seq !== requestSeqRef.current) return;
          setDraft(createEmptyLayerProfileDraft(currentProfileId));
          setSource('empty');
          setDiagnostics([]);
          setError(errorMessage(err, 'Layer profile を読み込めません。'));
          clearPreview();
        } finally {
          if (seq === requestSeqRef.current) {
            setLoading(false);
          }
        }
      })();
    },
    [api, clearPreview, currentProfileId],
  );

  useEffect(() => {
    load('stored-or-infer');
  }, [load]);

  const mutateDraft = useCallback(
    (updater: (current: RepositoryLayerProfileDraft) => RepositoryLayerProfileDraft) => {
      setDraft((current) => {
        const base = current ?? createEmptyLayerProfileDraft(currentProfileId);
        return updater(base);
      });
      requestSeqRef.current += 1;
      setError(null);
      setMessage(null);
      clearPreview();
    },
    [clearPreview, currentProfileId],
  );

  const updateProfile = useCallback(
    (patch: Partial<RepositoryLayerProfileDraft>) => {
      mutateDraft((current) => ({ ...current, ...patch }));
    },
    [mutateDraft],
  );

  const updateRule = useCallback(
    (index: number, patch: Partial<RepositoryLayerRuleDraft>) => {
      mutateDraft((current) => ({
        ...current,
        rules: current.rules.map((rule, ruleIndex) =>
          ruleIndex === index ? { ...rule, ...patch } : rule,
        ),
      }));
    },
    [mutateDraft],
  );

  const addRule = useCallback(
    (input: Partial<RepositoryLayerRuleDraft> = {}) => {
      mutateDraft((current) => ({
        ...current,
        rules: [...current.rules, createLayerRuleDraft(current.rules, input)],
      }));
    },
    [mutateDraft],
  );

  const removeRule = useCallback(
    (index: number) => {
      mutateDraft((current) => ({
        ...current,
        rules: current.rules.filter((_, ruleIndex) => ruleIndex !== index),
      }));
    },
    [mutateDraft],
  );

  const updateIgnorePattern = useCallback(
    (index: number, patch: Partial<RepositoryLayerIgnorePatternDraft>) => {
      mutateDraft((current) => ({
        ...current,
        ignoredPatterns: current.ignoredPatterns.map((pattern, patternIndex) =>
          patternIndex === index ? { ...pattern, ...patch } : pattern,
        ),
      }));
    },
    [mutateDraft],
  );

  const addIgnorePattern = useCallback(
    (input: Partial<RepositoryLayerIgnorePatternDraft> = {}) => {
      mutateDraft((current) => ({
        ...current,
        ignoredPatterns: [...current.ignoredPatterns, createIgnorePatternDraft(input)],
      }));
    },
    [mutateDraft],
  );

  const removeIgnorePattern = useCallback(
    (index: number) => {
      mutateDraft((current) => ({
        ...current,
        ignoredPatterns: current.ignoredPatterns.filter(
          (_, patternIndex) => patternIndex !== index,
        ),
      }));
    },
    [mutateDraft],
  );

  const addRuleFromSuggestion = useCallback(
    (suggestion: GraphLayerUnclassifiedDirectory, layerPath: string) => {
      const normalizedLayerPath = layerPath.trim();
      addRule({
        glob: suggestion.suggestedGlob,
        layerPath: normalizedLayerPath,
        displayName: normalizedLayerPath.split('/').filter(Boolean).at(-1) ?? normalizedLayerPath,
      });
    },
    [addRule],
  );

  const addIgnoreFromSuggestion = useCallback(
    (suggestion: GraphLayerUnclassifiedDirectory) => {
      addIgnorePattern({
        glob: suggestion.suggestedGlob,
        reason: suggestion.directoryPath ? `unclassified:${suggestion.directoryPath}` : null,
      });
    },
    [addIgnorePattern],
  );

  const preview = useCallback(() => {
    if (!draft || !reviewWorkspaceId) {
      return;
    }
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    const signature = draftSignature;
    setBusy(true);
    setError(null);
    setMessage(null);
    void (async () => {
      try {
        const result = await api.previewLayerProfile({
          reviewWorkspaceId,
          draft,
        });
        if (seq !== requestSeqRef.current || signature !== draftSignatureRef.current) return;
        if (!result.ok) {
          setPreviewSummary(null);
          setPreviewDiagnostics(result.diagnostics);
          setViolationEdgeIds([]);
          throw new Error(result.message);
        }
        setPreviewSummary(result.summary);
        setPreviewDiagnostics(result.diagnostics);
        setViolationEdgeIds(result.violationEdgeIds);
        setMessage('Preview を更新しました。');
      } catch (err) {
        if (seq !== requestSeqRef.current || signature !== draftSignatureRef.current) return;
        setError(errorMessage(err, 'Layer preview に失敗しました。'));
      } finally {
        if (seq === requestSeqRef.current && signature === draftSignatureRef.current) {
          setBusy(false);
        }
      }
    })();
  }, [api, draft, draftSignature, reviewWorkspaceId]);

  const save = useCallback(() => {
    if (!draft) {
      return;
    }
    const seq = requestSeqRef.current + 1;
    requestSeqRef.current = seq;
    const signature = draftSignature;
    setBusy(true);
    setError(null);
    setMessage(null);
    void (async () => {
      try {
        const validation = await api.validateLayerProfile({ draft });
        if (seq !== requestSeqRef.current || signature !== draftSignatureRef.current) return;
        setDiagnostics(validation.issues);
        if (!validation.ok) {
          throw new Error(validation.message);
        }
        const saved = await api.saveLayerProfile({ draft });
        if (seq !== requestSeqRef.current || signature !== draftSignatureRef.current) return;
        if (!saved.ok) {
          setDiagnostics(saved.diagnostics);
          throw new Error(saved.message);
        }
        setDraft(layerProfileToDraft(saved.profile));
        setSource('stored');
        setDiagnostics(validation.issues);
        if (reviewWorkspaceId) {
          const recomputed = await api.recomputeWorkspaceLayerLayout({ reviewWorkspaceId });
          if (seq !== requestSeqRef.current) return;
          if (!recomputed.ok) {
            setMessage(`保存しました。Recompute: ${recomputed.message}`);
            return;
          }
        }
        setMessage('Layer profile を保存しました。');
        setPreviewSummary(null);
        setPreviewDiagnostics([]);
        setViolationEdgeIds([]);
      } catch (err) {
        if (seq !== requestSeqRef.current || signature !== draftSignatureRef.current) return;
        setError(errorMessage(err, 'Layer profile を保存できません。'));
      } finally {
        if (seq === requestSeqRef.current) {
          setBusy(false);
        }
      }
    })();
  }, [api, draft, draftSignature, reviewWorkspaceId]);

  return {
    selectedRepositoryProfileId: currentProfileId,
    draft,
    source,
    reusableProfile,
    diagnostics,
    previewSummary,
    previewDiagnostics,
    violationEdgeIds,
    loading,
    busy,
    error,
    message,
    canPreview: Boolean(reviewWorkspaceId && draft),
    setSelectedRepositoryProfileId,
    reload: () => load('stored-or-infer'),
    inferDraft: () => load('infer'),
    updateProfile,
    updateRule,
    addRule,
    removeRule,
    updateIgnorePattern,
    addIgnorePattern,
    removeIgnorePattern,
    addRuleFromSuggestion,
    addIgnoreFromSuggestion,
    preview,
    save,
  };
}
