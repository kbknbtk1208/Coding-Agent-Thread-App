import path from 'path';
import type {
  RepositoryLocator,
  RepositoryProfile,
  ResolvedRepositoryProvider,
} from '../../../shared/poc3-domain/repository';

function normalizePathForIdentity(input: string): string {
  return input.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function locatorKey(locator: RepositoryLocator): string {
  if (locator.kind === 'github') {
    return `github:${locator.owner.toLowerCase()}/${locator.repo.toLowerCase()}`;
  }
  return `gitlab:${locator.projectPathOrId
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase()}`;
}

function providerKey(provider: ResolvedRepositoryProvider): string {
  const baseUrl = provider.baseUrl.trim().replace(/\/+$/, '').toLowerCase();
  return `${provider.kind}:${provider.host.toLowerCase()}:${baseUrl}`;
}

export function repoRelativeWorktreeRootSubpath(input: {
  localClonePath: string;
  worktreeRootPath: string;
}): string {
  const localClonePath = path.resolve(input.localClonePath);
  const worktreeRootPath = path.resolve(input.worktreeRootPath);
  const relative = path.relative(localClonePath, worktreeRootPath);
  if (!relative || relative === '.') {
    return '.';
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return normalizePathForIdentity(input.worktreeRootPath);
  }
  return normalizePathForIdentity(relative);
}

export function buildRepositoryIdentityKey(profile: RepositoryProfile): string {
  return [
    providerKey(profile.resolvedProvider),
    locatorKey(profile.repoLocator),
    `root:${repoRelativeWorktreeRootSubpath({
      localClonePath: profile.localClonePath,
      worktreeRootPath: profile.worktreeRootPath,
    })}`,
  ].join('|');
}
