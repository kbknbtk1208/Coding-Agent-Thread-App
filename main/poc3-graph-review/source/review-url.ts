import type { ReviewProviderKind } from '../../../shared/poc3-domain/review-workspace';

export interface ParsedReviewUrl {
  provider: ReviewProviderKind;
  host: string;
  reviewId: string;
  repositoryPath: string;
  normalizedReviewUrl: string;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parseUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('review URL is empty.');
  }
  return new URL(trimmed);
}

function normalizePathSegments(pathname: string): string[] {
  return pathname
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

function tryParseGithubUrl(url: URL): ParsedReviewUrl | null {
  const segments = normalizePathSegments(url.pathname);
  const pullIndex = segments.indexOf('pull');
  if (pullIndex === -1 || segments.length < pullIndex + 2) {
    return null;
  }
  const owner = segments[0];
  const repo = segments[1];
  const reviewId = segments[pullIndex + 1];
  if (!owner || !repo || !reviewId || !/^\d+$/.test(reviewId)) {
    return null;
  }

  return {
    provider: 'github',
    host: url.hostname.toLowerCase(),
    reviewId,
    repositoryPath: `${owner}/${repo}`,
    normalizedReviewUrl: stripTrailingSlash(
      `https://${url.hostname.toLowerCase()}/${owner}/${repo}/pull/${reviewId}`,
    ),
  };
}

function tryParseGitlabUrl(url: URL): ParsedReviewUrl | null {
  const pathname = url.pathname.replace(/^\/+|\/+$/g, '');
  const match = /^(.+)\/-\/merge_requests\/(\d+)(?:\/.*)?$/.exec(pathname);
  if (!match) {
    return null;
  }
  const projectPath = match[1];
  const reviewId = match[2];
  if (!projectPath || !reviewId) {
    return null;
  }

  return {
    provider: 'gitlab',
    host: url.hostname.toLowerCase(),
    reviewId,
    repositoryPath: projectPath,
    normalizedReviewUrl: stripTrailingSlash(
      `https://${url.hostname.toLowerCase()}/${projectPath}/-/merge_requests/${reviewId}`,
    ),
  };
}

export function parseReviewUrl(input: string): ParsedReviewUrl {
  const url = parseUrl(input);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Unsupported review URL protocol: ${url.protocol}`);
  }

  const gitlab = tryParseGitlabUrl(url);
  if (gitlab) {
    return gitlab;
  }
  const github = tryParseGithubUrl(url);
  if (github) {
    return github;
  }

  throw new Error(
    'Review URL は GitHub PR (/owner/repo/pull/:n) または GitLab MR (/group/project/-/merge_requests/:iid) 形式で入力してください。',
  );
}
