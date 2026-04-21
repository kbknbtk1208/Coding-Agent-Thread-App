import type {
  RepositoryLocator,
  RepositoryProvider,
  RepositoryProviderCandidate,
  ResolveRepositoryProviderResult,
} from '../../../shared/poc3-domain/repository';
import { baseUrlHost, parseRepositoryUrl } from '../source/repository-url';

export function resolveRepositoryProviderCandidates(
  originUrl: string,
  providers: RepositoryProvider[],
  selectedRepositoryProviderId?: string,
): ResolveRepositoryProviderResult {
  let parsed: ReturnType<typeof parseRepositoryUrl>;
  try {
    parsed = parseRepositoryUrl(originUrl);
  } catch (err) {
    return {
      normalizedOriginUrl: null,
      candidates: [],
      repoLocator: null,
      status: 'invalidUrl',
      message: err instanceof Error ? err.message : 'Invalid repository URL.',
    };
  }

  const candidates: RepositoryProviderCandidate[] = providers
    .flatMap((provider) => {
      try {
        const host = baseUrlHost(provider.baseUrl);
        if (host !== parsed.host) {
          return [];
        }
        return [
          {
            repositoryProviderId: provider.repositoryProviderId,
            displayName: provider.displayName,
            kind: provider.kind,
            baseUrl: provider.baseUrl,
            match: 'exactHost' as const,
          },
        ];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Number(b.match === 'exactHost') - Number(a.match === 'exactHost'));

  const selectedCandidate =
    candidates.find(
      (candidate) => candidate.repositoryProviderId === selectedRepositoryProviderId,
    ) ??
    candidates[0] ??
    null;
  const repoLocator = selectedCandidate
    ? (parsed.locatorByKind[selectedCandidate.kind] ?? null)
    : null;

  if (selectedCandidate && !repoLocator) {
    return {
      normalizedOriginUrl: parsed.normalizedOriginUrl,
      candidates,
      repoLocator: null,
      status: 'unsupportedUrl',
      message: `${selectedCandidate.kind} repository URL として解釈できません。`,
    };
  }

  if (candidates.length === 0) {
    return {
      normalizedOriginUrl: parsed.normalizedOriginUrl,
      candidates: [],
      repoLocator: null,
      status: 'noProvider',
      message: 'origin URL の host に一致する Repository Provider がありません。',
    };
  }

  return {
    normalizedOriginUrl: parsed.normalizedOriginUrl,
    candidates,
    repoLocator,
    status: candidates.length === 1 ? 'resolved' : 'multipleCandidates',
    message: candidates.length === 1 ? null : '複数の Repository Provider 候補があります。',
  };
}

export function resolveLocatorForProvider(
  originUrl: string,
  provider: RepositoryProvider,
): { normalizedOriginUrl: string; repoLocator: RepositoryLocator; host: string } {
  const parsed = parseRepositoryUrl(originUrl);
  const repoLocator = parsed.locatorByKind[provider.kind];
  if (!repoLocator) {
    throw new Error(`${provider.kind} repository URL として解釈できません。`);
  }

  return {
    normalizedOriginUrl: parsed.normalizedOriginUrl,
    repoLocator,
    host: parsed.host,
  };
}
