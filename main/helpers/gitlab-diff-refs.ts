import type { GitLabDiffTransport, GitLabSourceDiagnostic } from './gitlab-merge-request-diffs';

export interface GitLabDiffRefs {
  baseSha: string;
  headSha: string;
  startSha: string | null;
}

export interface ResolveGitLabDiffRefsInput {
  endpoint: string;
  projectPathOrId: string;
  mergeRequestIid: string | number;
  mrDiffRefs:
    | { base_sha?: string | null; head_sha?: string | null; start_sha?: string | null }
    | null
    | undefined;
  mrSha?: string | null;
  transport: Pick<GitLabDiffTransport, 'fetchPagedJson' | 'getHttpStatus'>;
}

interface GitLabMergeRequestVersion {
  base_commit_sha?: string | null;
  head_commit_sha?: string | null;
  start_commit_sha?: string | null;
}

function warning(code: string, message: string): GitLabSourceDiagnostic {
  return { code, message, severity: 'warning' };
}

export async function resolveGitLabDiffRefs(
  input: ResolveGitLabDiffRefsInput,
): Promise<{ refs: GitLabDiffRefs; diagnostics: GitLabSourceDiagnostic[] }> {
  let baseSha = input.mrDiffRefs?.base_sha ?? '';
  let headSha = input.mrDiffRefs?.head_sha ?? input.mrSha ?? '';
  let startSha = input.mrDiffRefs?.start_sha ?? null;
  const diagnostics: GitLabSourceDiagnostic[] = [];

  if (baseSha && headSha && startSha) {
    return { refs: { baseSha, headSha, startSha }, diagnostics };
  }

  try {
    const versions = await input.transport.fetchPagedJson<GitLabMergeRequestVersion>(
      `${input.endpoint}/projects/${encodeURIComponent(input.projectPathOrId)}/merge_requests/${encodeURIComponent(
        String(input.mergeRequestIid),
      )}/versions`,
      1,
    );
    const latest = versions[0];
    if (latest) {
      baseSha ||= latest.base_commit_sha ?? '';
      headSha ||= latest.head_commit_sha ?? '';
      startSha ||= latest.start_commit_sha ?? null;
      diagnostics.push(
        warning(
          'GITLAB_DIFF_REFS_FALLBACK_USED',
          'GitLab /versions endpoint で diff refs を補完しました。',
        ),
      );
    }
  } catch (err) {
    const status = input.transport.getHttpStatus(err);
    if (status !== 404 && status !== 405) {
      throw err;
    }
  }

  if (!baseSha || !headSha || !startSha) {
    diagnostics.push(
      warning('GITLAB_DIFF_REFS_INCOMPLETE', 'GitLab diff refs の一部を取得できませんでした。'),
    );
  }
  return { refs: { baseSha, headSha, startSha }, diagnostics };
}
