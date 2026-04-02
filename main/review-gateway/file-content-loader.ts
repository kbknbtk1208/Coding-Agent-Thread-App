import type {
  ReviewSnapshot,
  ReviewSnapshotFile,
  ReviewSourceLocator,
} from '../../shared/domain/review';
import { ReviewGatewayError } from './review-gateway-error';
import { requestText, type FetchLike } from './request-json';

function encodePathSegments(pathname: string): string {
  return pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function createBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
}

function buildGitHubContentsUrl(
  host: string,
  owner: string,
  repo: string,
  filePath: string,
  ref: string,
): string {
  const url = new URL(
    `repos/${encodePathSegments(owner)}/${encodePathSegments(repo)}/contents/${encodePathSegments(filePath)}`,
    createBaseUrl(host),
  );
  url.searchParams.set('ref', ref);
  return url.toString();
}

function buildGitLabRawUrl(
  host: string,
  projectPathOrId: string,
  filePath: string,
  ref: string,
): string {
  const url = new URL(
    `api/v4/projects/${encodeURIComponent(projectPathOrId)}/repository/files/${encodeURIComponent(filePath)}/raw`,
    createBaseUrl(host),
  );
  url.searchParams.set('ref', ref);
  return url.toString();
}

export async function hydrateReviewFileContent(args: {
  snapshot: ReviewSnapshot;
  locator: ReviewSourceLocator;
  token: string;
  fetchImpl?: FetchLike;
  file: ReviewSnapshotFile;
}): Promise<ReviewSnapshotFile> {
  const { snapshot, locator, token, fetchImpl, file } = args;

  if (file.isBinary) {
    return {
      ...file,
      contentStatus: 'failed',
    };
  }

  const headers: Record<string, string> =
    locator.provider === 'github'
      ? {
          Accept: 'application/vnd.github.raw',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2026-03-10',
        }
      : {
          'PRIVATE-TOKEN': token,
        };

  const nextContentStatus = {
    contentStatus: 'loading' as const,
  };
  const loadedFile: ReviewSnapshotFile = {
    ...file,
    ...nextContentStatus,
  };

  try {
    const fetchTextForPath = async (path: string | null, ref: string): Promise<string> => {
      if (!path) {
        return '';
      }
      const url =
        locator.provider === 'github'
          ? buildGitHubContentsUrl(locator.host, locator.owner, locator.repo, path, ref)
          : buildGitLabRawUrl(locator.host, locator.projectPathOrId, path, ref);
      return requestText(url, { fetchImpl, headers });
    };

    const oldPath =
      file.changeType === 'added'
        ? null
        : (file.providerContext.oldRemotePath ?? file.oldFilePath ?? file.filePath);
    const newPath =
      file.changeType === 'deleted' ? null : (file.providerContext.remotePath ?? file.filePath);

    const oldContent =
      file.changeType === 'added' ? '' : await fetchTextForPath(oldPath, snapshot.baseSha);
    const newContent =
      file.changeType === 'deleted' ? '' : await fetchTextForPath(newPath, snapshot.headSha);

    return {
      ...loadedFile,
      oldContent,
      newContent,
      contentStatus: 'loaded',
    };
  } catch (err: unknown) {
    if (err instanceof ReviewGatewayError && err.code === 'HTTP_ERROR' && err.status === 404) {
      return {
        ...file,
        contentStatus: 'failed',
      };
    }

    return {
      ...file,
      contentStatus: 'failed',
    };
  }
}
