import type { Variants } from 'framer-motion';
import type {
  PublicRepositoryProvider,
  RepositoryProfile,
  RepositoryProfileInput,
  RepositoryProviderKind,
  ResolveRepositoryProviderResult,
} from '../../../../shared/poc3-domain/repository';
import {
  POC3_MOTION_DELAY,
  POC3_MOTION_DURATION,
  POC3_MOTION_EASE,
  getMotionStaggerDelay,
  resolveMotionDuration,
} from '../components/motion-timing';

export const SETTINGS_LAYOUT_ID = 'poc3-repository-settings-surface';
export const FEY_GLASS_CARD_CLASS =
  'rounded-2xl border border-white/[0.08] bg-[#131313]/85 shadow-[0_0_44px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-26px_46px_rgba(0,0,0,0.34)] backdrop-blur-[6px]';

export const LIST_ITEM_MOTION_VARIANTS: Variants = {
  hidden: { opacity: 0, x: -18 },
  visible: (custom: unknown) => {
    const index =
      typeof custom === 'object' && custom != null && 'index' in custom
        ? (custom.index as unknown)
        : custom;
    const reducedMotion =
      typeof custom === 'object' && custom != null && 'reducedMotion' in custom
        ? custom.reducedMotion === true
        : false;
    const extraDelay =
      typeof custom === 'object' &&
      custom != null &&
      'extraDelay' in custom &&
      typeof (custom as { extraDelay: unknown }).extraDelay === 'number'
        ? (custom as { extraDelay: number }).extraDelay
        : 0;
    return {
      opacity: 1,
      x: 0,
      transition: {
        duration: resolveMotionDuration(POC3_MOTION_DURATION.listItem, reducedMotion, 0.08),
        ease: POC3_MOTION_EASE.standard,
        delay: getMotionStaggerDelay(
          index,
          POC3_MOTION_DELAY.repositoryListStep,
          POC3_MOTION_DELAY.repositoryListBase + extraDelay,
          POC3_MOTION_DELAY.repositoryListMax,
          reducedMotion,
        ),
      },
    };
  },
};

export interface ProviderDraft {
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

export interface ProfileDraft {
  draftId: string;
  repositoryProfileId?: string;
  layoutId: string;
  repositoryProviderId: string;
  originUrl: string;
  localClonePath: string;
  worktreeRootPath: string;
  setupScriptText: string;
  showSetupScript: boolean;
  isEditing: boolean;
  isResolvingProvider: boolean;
  resolution: ResolveRepositoryProviderResult | null;
  lastAutoWorktreePath: string;
  message: string | null;
  error: string | null;
  busy: boolean;
}

export function createDraftId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultBaseUrl(kind: RepositoryProviderKind): string {
  return kind === 'github' ? 'https://github.com' : 'https://gitlab.com';
}

export function providerAddLayoutId(index: number): string {
  return `poc3-provider-add-${index}`;
}

export function repositoryAddLayoutId(index: number): string {
  return `poc3-repository-add-${index}`;
}

export function newProviderDraft(index: number): ProviderDraft {
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

export function newProfileDraft(index: number): ProfileDraft {
  return {
    draftId: createDraftId('profile'),
    layoutId: repositoryAddLayoutId(index),
    repositoryProviderId: '',
    originUrl: '',
    localClonePath: '',
    worktreeRootPath: '',
    setupScriptText: '',
    showSetupScript: false,
    isEditing: true,
    isResolvingProvider: false,
    resolution: null,
    lastAutoWorktreePath: '',
    message: null,
    error: null,
    busy: false,
  };
}

export function providerToDraft(provider: PublicRepositoryProvider): ProviderDraft {
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

export function profileToDraft(profile: RepositoryProfile): ProfileDraft {
  return {
    draftId: profile.repositoryProfileId,
    repositoryProfileId: profile.repositoryProfileId,
    layoutId: `poc3-repository-card-${profile.repositoryProfileId}`,
    repositoryProviderId: profile.repositoryProviderId,
    originUrl: profile.originUrl,
    localClonePath: profile.localClonePath,
    worktreeRootPath: profile.worktreeRootPath,
    setupScriptText: profile.setupScript?.scriptText ?? '',
    showSetupScript: Boolean(profile.setupScript?.scriptText),
    isEditing: false,
    isResolvingProvider: false,
    resolution: null,
    lastAutoWorktreePath: '',
    message: null,
    error: null,
    busy: false,
  };
}

export function getAutoWorktreePath(localClonePath: string): string {
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

export function hostLabelFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).hostname.toLowerCase();
  } catch {
    return baseUrl.trim();
  }
}

export function providerDisplayName(draft: Pick<ProviderDraft, 'kind' | 'baseUrl'>): string {
  return hostLabelFromBaseUrl(draft.baseUrl) || (draft.kind === 'github' ? 'GitHub' : 'GitLab');
}

export function providerOptionLabel(
  provider: Pick<PublicRepositoryProvider, 'kind' | 'baseUrl'>,
): string {
  const host = hostLabelFromBaseUrl(provider.baseUrl);
  return host ? `${provider.kind} / ${host}` : provider.kind;
}

export function repositoryDisplayName(originUrl: string): string {
  const trimmed = originUrl.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const pathSegments = url.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    return pathSegments.length > 1 ? pathSegments.slice(1).join('/') : (pathSegments[0] ?? trimmed);
  } catch {
    const scpLikePath = trimmed.match(/^[^@]+@[^:]+:(.+)$/)?.[1];
    const path = scpLikePath ?? trimmed;
    const pathSegments = path
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);
    return pathSegments.length > 1 ? pathSegments.slice(1).join('/') : trimmed;
  }
}

export function resolutionText(resolution: ResolveRepositoryProviderResult | null): string {
  if (!resolution) {
    return '';
  }
  if (resolution.status === 'resolved') {
    return '';
  }
  return resolution.message ?? 'Provider 解決結果を確認してください。';
}

export function isProviderResolutionFailure(resolution: ResolveRepositoryProviderResult): boolean {
  return ['invalidUrl', 'noProvider', 'unsupportedUrl'].includes(resolution.status);
}

export function isEmptyNewProfileDraft(draft: ProfileDraft): boolean {
  return (
    !draft.repositoryProfileId &&
    !draft.originUrl.trim() &&
    !draft.localClonePath.trim() &&
    !draft.worktreeRootPath.trim() &&
    !draft.setupScriptText.trim()
  );
}

export function isSameProfileDraftInput(candidate: ProfileDraft, snapshot: ProfileDraft): boolean {
  return (
    candidate.draftId === snapshot.draftId &&
    candidate.repositoryProfileId === snapshot.repositoryProfileId &&
    candidate.originUrl === snapshot.originUrl &&
    candidate.localClonePath === snapshot.localClonePath &&
    candidate.worktreeRootPath === snapshot.worktreeRootPath &&
    candidate.setupScriptText === snapshot.setupScriptText
  );
}

export function profilePayload(
  draft: ProfileDraft,
  repositoryProviderId: string,
  allowOriginMismatch = false,
): RepositoryProfileInput {
  return {
    repositoryProfileId: draft.repositoryProfileId,
    repositoryProviderId,
    originUrl: draft.originUrl,
    localClonePath: draft.localClonePath,
    worktreeRootPath: draft.worktreeRootPath,
    allowOriginMismatch,
    setupScript: draft.setupScriptText.trim()
      ? {
          scriptText: draft.setupScriptText,
          shell: 'powershell',
          cwdMode: 'worktreePath',
        }
      : null,
  };
}
