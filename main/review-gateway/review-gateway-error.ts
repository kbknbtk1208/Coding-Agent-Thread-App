import type { ReviewProvider } from '../../shared/domain/review';

export type ReviewGatewayErrorCode =
  | 'INVALID_SOURCE_URL'
  | 'PROVIDER_MISMATCH'
  | 'MISSING_TOKEN'
  | 'HTTP_ERROR'
  | 'REQUEST_FAILED'
  | 'REQUEST_TIMEOUT'
  | 'SNAPSHOT_NOT_FOUND'
  | 'FILE_NOT_FOUND'
  | 'THREAD_NOT_FOUND';

export class ReviewGatewayError extends Error {
  readonly code: ReviewGatewayErrorCode;
  readonly provider?: ReviewProvider;
  readonly status?: number;

  constructor(
    code: ReviewGatewayErrorCode,
    message: string,
    options?: {
      provider?: ReviewProvider;
      status?: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'ReviewGatewayError';
    this.code = code;
    this.provider = options?.provider;
    this.status = options?.status;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isReviewGatewayError(err: unknown): err is ReviewGatewayError {
  return err instanceof ReviewGatewayError;
}

export function getProviderTokenEnvName(provider: ReviewProvider): string {
  return provider === 'github' ? 'REVIEW_GITHUB_TOKEN' : 'REVIEW_GITLAB_TOKEN';
}

export function resolveProviderToken(provider: ReviewProvider): string {
  const envName = getProviderTokenEnvName(provider);
  const token = process.env[envName];
  if (!token) {
    throw new ReviewGatewayError('MISSING_TOKEN', `${envName} is not set.`, { provider });
  }
  return token;
}
