import type {
  RepositoryLocator,
  RepositoryProviderKind,
} from '../../../shared/poc3-domain/repository';

export interface ParsedRepositoryUrl {
  normalizedOriginUrl: string;
  host: string;
  path: string;
  locatorByKind: Partial<Record<RepositoryProviderKind, RepositoryLocator>>;
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '').replace(/\/+$/, '');
}

function normalizePath(pathname: string): string {
  return stripGitSuffix(pathname.replace(/^\/+/, '')).replace(/\/+/g, '/');
}

function parseSshScpLikeUrl(input: string): ParsedRepositoryUrl | null {
  const match = /^git@([^:]+):(.+)$/.exec(input.trim());
  if (!match) {
    return null;
  }

  const host = match[1].toLowerCase();
  const path = normalizePath(match[2]);
  return buildParsedRepositoryUrl(`https://${host}/${path}`, host, path);
}

function parseUrlInput(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Repository URL is empty.');
  }

  return new URL(trimmed);
}

function githubLocatorFromPath(path: string): RepositoryLocator | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length !== 2) {
    return null;
  }

  return {
    kind: 'github',
    owner: segments[0],
    repo: segments[1],
  };
}

function gitlabLocatorFromPath(path: string): RepositoryLocator | null {
  if (!path || path.split('/').filter(Boolean).length < 1) {
    return null;
  }

  return {
    kind: 'gitlab',
    projectPathOrId: path,
  };
}

function buildParsedRepositoryUrl(
  normalizedOriginUrl: string,
  host: string,
  path: string,
): ParsedRepositoryUrl {
  const locatorByKind: Partial<Record<RepositoryProviderKind, RepositoryLocator>> = {};
  const githubLocator = githubLocatorFromPath(path);
  if (githubLocator) {
    locatorByKind.github = githubLocator;
  }
  const gitlabLocator = gitlabLocatorFromPath(path);
  if (gitlabLocator) {
    locatorByKind.gitlab = gitlabLocator;
  }

  return {
    normalizedOriginUrl,
    host,
    path,
    locatorByKind,
  };
}

export function parseRepositoryUrl(input: string): ParsedRepositoryUrl {
  const sshScpLike = parseSshScpLikeUrl(input);
  if (sshScpLike) {
    return sshScpLike;
  }

  const url = parseUrlInput(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'ssh:') {
    throw new Error(`Unsupported repository URL protocol: ${url.protocol}`);
  }

  const host = url.hostname.toLowerCase();
  const path = normalizePath(url.pathname);
  if (!host || !path) {
    throw new Error('Repository URL must include host and path.');
  }

  return buildParsedRepositoryUrl(`https://${host}/${path}`, host, path);
}

export function normalizeRepositoryKey(input: string): string {
  const parsed = parseRepositoryUrl(input);
  return `${parsed.host}/${parsed.path}`.toLowerCase();
}

export function baseUrlHost(input: string): string {
  const url = new URL(input.trim());
  return url.hostname.toLowerCase();
}

export function apiEndpointForProvider(kind: RepositoryProviderKind, baseUrl: string): string {
  const url = new URL(baseUrl.trim());
  const origin = `${url.protocol}//${url.host}`;
  if (kind === 'github') {
    return url.hostname.toLowerCase() === 'github.com'
      ? 'https://api.github.com'
      : `${origin}/api/v3`;
  }

  return `${origin}/api/v4`;
}
