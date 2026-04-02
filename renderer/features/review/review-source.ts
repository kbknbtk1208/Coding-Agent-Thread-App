import type { ReviewProvider, ReviewSourceDraft } from '../../../shared/domain/review';

const DEFAULT_REVIEW_HOSTS: Record<ReviewProvider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com',
};

export function getDefaultReviewHost(provider: ReviewProvider): string {
  return DEFAULT_REVIEW_HOSTS[provider];
}

export function getReviewTokenEnvName(provider: ReviewProvider): string {
  return provider === 'github' ? 'REVIEW_GITHUB_TOKEN' : 'REVIEW_GITLAB_TOKEN';
}

export function isReviewProvider(value: string): value is ReviewProvider {
  return value === 'github' || value === 'gitlab';
}

export function inferProviderFromReviewUrl(reviewUrl: string): ReviewProvider | null {
  const normalized = reviewUrl.toLowerCase();

  if (normalized.includes('/-/merge_requests/')) {
    return 'gitlab';
  }

  if (normalized.includes('/pull/')) {
    return 'github';
  }

  return null;
}

export function serializeReviewSource(source: ReviewSourceDraft): string {
  return `${source.provider}|${source.host}|${source.reviewUrl}`;
}
