import { parseGitLabRawDiff } from './gitlab-raw-diff-parser';

export type GitLabDiffsSource = 'diffs' | 'changes' | 'raw_diffs';

export interface GitLabNormalizedMergeRequestDiff {
  old_path: string;
  new_path: string;
  a_mode?: string | null;
  b_mode?: string | null;
  diff: string | null;
  new_file: boolean;
  renamed_file: boolean;
  deleted_file: boolean;
  collapsed: boolean;
  too_large: boolean;
}

export interface GitLabSourceDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  filePath?: string | null;
}

export interface GitLabDiffTransport {
  fetchJson<T>(url: string): Promise<T>;
  fetchPagedJson<T>(url: string, limit: number, pageSize?: number): Promise<T[]>;
  fetchText(url: string): Promise<string>;
  getHttpStatus(err: unknown): number | null;
}

export interface FetchGitLabMergeRequestDiffsInput {
  endpoint: string;
  projectPathOrId: string;
  mergeRequestIid: string | number;
  maxChangedFiles: number;
  transport: GitLabDiffTransport;
}

export interface FetchGitLabMergeRequestDiffsResult {
  diffs: GitLabNormalizedMergeRequestDiff[];
  source: GitLabDiffsSource;
  diagnostics: GitLabSourceDiagnostic[];
}

interface GitLabChangesResponse {
  changes?: Array<Partial<GitLabNormalizedMergeRequestDiff>>;
  overflow?: boolean;
}

function isFallbackEligible(status: number | null): boolean {
  return status === 404 || status === 405;
}

function warning(code: string, message: string): GitLabSourceDiagnostic {
  return { code, message, severity: 'warning' };
}

function normalizeDiff(
  diff: Partial<GitLabNormalizedMergeRequestDiff>,
): GitLabNormalizedMergeRequestDiff {
  const oldPath = diff.old_path ?? diff.new_path ?? '';
  const newPath = diff.new_path ?? diff.old_path ?? '';
  return {
    old_path: oldPath,
    new_path: newPath,
    a_mode: diff.a_mode ?? null,
    b_mode: diff.b_mode ?? null,
    diff: diff.diff ?? null,
    new_file: diff.new_file ?? false,
    renamed_file: diff.renamed_file ?? false,
    deleted_file: diff.deleted_file ?? false,
    collapsed: diff.collapsed ?? false,
    too_large: diff.too_large ?? false,
  };
}

function buildMrUrl(input: FetchGitLabMergeRequestDiffsInput, suffix: string): string {
  return `${input.endpoint}/projects/${encodeURIComponent(input.projectPathOrId)}/merge_requests/${encodeURIComponent(
    String(input.mergeRequestIid),
  )}${suffix}`;
}

function normalizeRawDiffs(rawText: string): GitLabNormalizedMergeRequestDiff[] {
  return parseGitLabRawDiff(rawText).map((file) => ({
    old_path: file.oldPath,
    new_path: file.newPath,
    a_mode: file.oldMode,
    b_mode: file.newMode,
    diff: file.diff,
    new_file: file.newFile,
    renamed_file: file.renamedFile,
    deleted_file: file.deletedFile,
    collapsed: false,
    too_large: false,
  }));
}

export async function fetchGitLabMergeRequestDiffsWithFallback(
  input: FetchGitLabMergeRequestDiffsInput,
): Promise<FetchGitLabMergeRequestDiffsResult> {
  const diagnostics: GitLabSourceDiagnostic[] = [];
  try {
    const diffs = await input.transport.fetchPagedJson<GitLabNormalizedMergeRequestDiff>(
      buildMrUrl(input, '/diffs'),
      input.maxChangedFiles,
    );
    return { diffs: diffs.map(normalizeDiff), source: 'diffs', diagnostics };
  } catch (err) {
    if (!isFallbackEligible(input.transport.getHttpStatus(err))) {
      throw err;
    }
    diagnostics.push(
      warning(
        'GITLAB_DIFFS_ENDPOINT_UNAVAILABLE',
        'GitLab /diffs endpoint が利用できないため /changes にフォールバックしました。',
      ),
    );
  }

  try {
    const changes = await input.transport.fetchJson<GitLabChangesResponse>(
      buildMrUrl(input, '/changes'),
    );
    const diffs = Array.isArray(changes.changes) ? changes.changes.map(normalizeDiff) : [];
    diagnostics.push(
      warning('GITLAB_CHANGES_FALLBACK_USED', 'GitLab /changes endpoint で diff を取得しました。'),
    );
    if (changes.overflow === true) {
      diagnostics.push(
        warning('GITLAB_CHANGES_OVERFLOW', 'GitLab /changes response が overflow しています。'),
      );
    }
    return { diffs, source: 'changes', diagnostics };
  } catch (err) {
    if (!isFallbackEligible(input.transport.getHttpStatus(err))) {
      throw err;
    }
  }

  const rawText = await input.transport.fetchText(buildMrUrl(input, '/raw_diffs'));
  diagnostics.push(
    warning(
      'GITLAB_RAW_DIFFS_FALLBACK_USED',
      'GitLab /raw_diffs endpoint で diff を取得しました。',
    ),
    warning('GITLAB_RAW_DIFFS_PARTIAL_METADATA', 'raw diff 由来のため一部 metadata は推定値です。'),
  );
  return { diffs: normalizeRawDiffs(rawText), source: 'raw_diffs', diagnostics };
}
