import type {
  ReviewProvider,
  ReviewSourceDraft,
  ReviewSourceLocator,
} from '../../shared/domain/review';
import { ReviewGatewayError } from './review-gateway-error';

function normalizeUrl(input: string, label: string): URL {
  try {
    return new URL(input);
  } catch (err) {
    throw new ReviewGatewayError('INVALID_SOURCE_URL', `Invalid ${label}: ${input}`, {
      cause: err,
    });
  }
}

function normalizeApiHost(provider: ReviewProvider, host: string): string {
  const trimmed = host.trim();
  if (!trimmed) {
    return provider === 'github' ? 'https://api.github.com' : 'https://gitlab.com';
  }
  return normalizeUrl(trimmed, 'host').toString().replace(/\/$/, '');
}

function parseGithubUrl(url: URL, apiHost: string): ReviewSourceLocator {
  const match =
    /^\/([^/]+)\/([^/]+)\/pulls?\/(\d+)(?:\/.*)?$/.exec(url.pathname) ??
    /^\/repos\/([^/]+)\/([^/]+)\/pulls?\/(\d+)(?:\/.*)?$/.exec(url.pathname);

  if (!match) {
    throw new ReviewGatewayError(
      'INVALID_SOURCE_URL',
      `Unsupported GitHub review URL: ${url.href}`,
    );
  }

  return {
    provider: 'github',
    host: apiHost,
    owner: match[1],
    repo: match[2],
    pullNumber: Number(match[3]),
  };
}

function parseGitLabUrl(url: URL, apiHost: string): ReviewSourceLocator {
  const match = /^\/(.+)\/-\/merge_requests\/(\d+)(?:\/.*)?$/.exec(url.pathname);

  if (!match) {
    throw new ReviewGatewayError(
      'INVALID_SOURCE_URL',
      `Unsupported GitLab review URL: ${url.href}`,
    );
  }

  return {
    provider: 'gitlab',
    host: apiHost,
    projectPathOrId: match[1],
    mergeRequestIid: Number(match[2]),
  };
}

export function parseReviewSource(source: ReviewSourceDraft): ReviewSourceLocator {
  const url = normalizeUrl(source.reviewUrl, 'review URL');
  const apiHost = normalizeApiHost(source.provider, source.host);

  if (source.provider === 'github') {
    if (/merge_requests/i.test(url.pathname)) {
      throw new ReviewGatewayError(
        'PROVIDER_MISMATCH',
        `Review URL ${source.reviewUrl} looks like a GitLab source, but provider is github.`,
      );
    }

    return parseGithubUrl(url, apiHost);
  }

  if (/\/pulls?\//i.test(url.pathname)) {
    throw new ReviewGatewayError(
      'PROVIDER_MISMATCH',
      `Review URL ${source.reviewUrl} looks like a GitHub source, but provider is gitlab.`,
    );
  }

  return parseGitLabUrl(url, apiHost);
}
