import type {
  RepositoryLocator,
  RepositoryProfile,
  RepositoryProvider,
} from '../../../shared/poc3-domain/repository';
import type { ResolveReviewWorkspaceTargetResult } from '../../../shared/poc3-domain/review-workspace';
import { baseUrlHost } from '../source/repository-url';
import { parseReviewUrl } from '../source/review-url';

function repositoryLabelFromLocator(locator: RepositoryLocator): string {
  return locator.kind === 'github' ? `${locator.owner}/${locator.repo}` : locator.projectPathOrId;
}

function locatorMatchesRepositoryPath(locator: RepositoryLocator, repositoryPath: string): boolean {
  const normalized = repositoryPath.replace(/\.git$/i, '').toLowerCase();
  if (locator.kind === 'github') {
    return `${locator.owner}/${locator.repo}`.toLowerCase() === normalized;
  }
  return locator.projectPathOrId.toLowerCase() === normalized;
}

export function resolveReviewWorkspaceTarget(
  reviewUrl: string,
  providers: RepositoryProvider[],
  profiles: RepositoryProfile[],
): ResolveReviewWorkspaceTargetResult {
  let parsed: ReturnType<typeof parseReviewUrl>;
  try {
    parsed = parseReviewUrl(reviewUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Review URL を解釈できません。';
    const isUnsupported = /Unsupported|形式/.test(message);
    return {
      ok: false,
      status: isUnsupported ? 'unsupportedUrl' : 'invalidUrl',
      message,
      target: null,
    };
  }

  const matchingProviders = providers.filter((provider) => {
    try {
      return baseUrlHost(provider.baseUrl) === parsed.host && provider.kind === parsed.provider;
    } catch {
      return false;
    }
  });

  if (matchingProviders.length === 0) {
    return {
      ok: false,
      status: 'noProvider',
      message: `${parsed.host} に対応する ${parsed.provider} Provider が登録されていません。`,
      target: null,
    };
  }

  const providerIds = new Set(matchingProviders.map((provider) => provider.repositoryProviderId));
  const candidateProfiles = profiles.filter(
    (profile) =>
      providerIds.has(profile.repositoryProviderId) &&
      profile.resolvedProvider.kind === parsed.provider &&
      locatorMatchesRepositoryPath(profile.repoLocator, parsed.repositoryPath),
  );

  if (candidateProfiles.length === 0) {
    return {
      ok: false,
      status: 'noRepositoryProfile',
      message: `${parsed.repositoryPath} に対応する Repository Profile が登録されていません。`,
      target: null,
    };
  }

  if (candidateProfiles.length > 1) {
    return {
      ok: false,
      status: 'multipleRepositoryProfiles',
      message: `${parsed.repositoryPath} に複数の Repository Profile が一致しました。1 つに絞ってから再度お試しください。`,
      target: null,
    };
  }

  const profile = candidateProfiles[0];
  return {
    ok: true,
    status: 'resolved',
    message: null,
    target: {
      repositoryProviderId: profile.repositoryProviderId,
      repositoryProfileId: profile.repositoryProfileId,
      provider: parsed.provider,
      reviewUrl: parsed.normalizedReviewUrl,
      reviewId: parsed.reviewId,
      repositoryLabel: repositoryLabelFromLocator(profile.repoLocator),
      originUrl: profile.originUrl,
      localClonePath: profile.localClonePath,
      worktreeRootPath: profile.worktreeRootPath,
      setupScript: profile.setupScript,
    },
  };
}
