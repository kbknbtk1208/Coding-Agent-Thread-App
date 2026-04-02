import { afterEach, describe, expect, it } from 'vitest';
import type { ReviewSourceDraft } from '../../shared/domain/review';
import { resolveProviderToken } from './review-gateway-error';
import { parseReviewSource } from './source-parser';

describe('parseReviewSource', () => {
  it('parses a GitHub pull request URL', () => {
    const source: ReviewSourceDraft = {
      provider: 'github',
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/octocat/hello-world/pull/42',
    };

    expect(parseReviewSource(source)).toEqual({
      provider: 'github',
      host: 'https://api.github.com',
      owner: 'octocat',
      repo: 'hello-world',
      pullNumber: 42,
    });
  });

  it('preserves a self-hosted API base path', () => {
    const source: ReviewSourceDraft = {
      provider: 'github',
      host: 'https://ghe.example.com/api/v3/',
      reviewUrl: 'https://ghe.example.com/octocat/hello-world/pull/42',
    };

    expect(parseReviewSource(source)).toEqual({
      provider: 'github',
      host: 'https://ghe.example.com/api/v3',
      owner: 'octocat',
      repo: 'hello-world',
      pullNumber: 42,
    });
  });

  it('preserves a self-hosted API base path', () => {
    const source: ReviewSourceDraft = {
      provider: 'github',
      host: 'https://github.example.com/api/v3',
      reviewUrl: 'https://github.example.com/acme/platform/pull/7',
    };

    expect(parseReviewSource(source)).toEqual({
      provider: 'github',
      host: 'https://github.example.com/api/v3',
      owner: 'acme',
      repo: 'platform',
      pullNumber: 7,
    });
  });

  it('parses a GitLab merge request URL', () => {
    const source: ReviewSourceDraft = {
      provider: 'gitlab',
      host: 'https://gitlab.example.com',
      reviewUrl: 'https://gitlab.example.com/group/project/-/merge_requests/17',
    };

    expect(parseReviewSource(source)).toEqual({
      provider: 'gitlab',
      host: 'https://gitlab.example.com',
      projectPathOrId: 'group/project',
      mergeRequestIid: 17,
    });
  });

  it('rejects a provider mismatch', () => {
    expect(() =>
      parseReviewSource({
        provider: 'github',
        host: 'https://api.github.com',
        reviewUrl: 'https://gitlab.com/group/project/-/merge_requests/17',
      }),
    ).toThrow(/looks like a GitLab source/);
  });
});

describe('resolveProviderToken', () => {
  const originalGithubToken = process.env.REVIEW_GITHUB_TOKEN;

  afterEach(() => {
    if (originalGithubToken === undefined) {
      delete process.env.REVIEW_GITHUB_TOKEN;
    } else {
      process.env.REVIEW_GITHUB_TOKEN = originalGithubToken;
    }
  });

  it('throws when the token is missing', () => {
    delete process.env.REVIEW_GITHUB_TOKEN;

    expect(() => resolveProviderToken('github')).toThrow('REVIEW_GITHUB_TOKEN is not set.');
  });
});
