import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type {
  RepositoryProfileInput,
  RepositoryProfileValidationIssue,
  RepositoryProfileValidationResult,
  RepositoryProvider,
} from '../../../shared/poc3-domain/repository';
import { baseUrlHost, normalizeRepositoryKey, parseRepositoryUrl } from '../source/repository-url';

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 10_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message).trim()));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function issue(
  code: RepositoryProfileValidationIssue['code'],
  severity: RepositoryProfileValidationIssue['severity'],
  message: string,
  detail?: string,
): RepositoryProfileValidationIssue {
  return { code, severity, message, detail };
}

async function isDirectory(targetPath: string): Promise<boolean | null> {
  try {
    const stat = await fs.stat(targetPath);
    return stat.isDirectory();
  } catch {
    return null;
  }
}

export async function validateRepositoryProfileInput(
  input: RepositoryProfileInput,
  provider: RepositoryProvider | null,
): Promise<RepositoryProfileValidationResult> {
  const issues: RepositoryProfileValidationIssue[] = [];
  let gitRemoteOriginUrl: string | null = null;
  let isDirty: boolean | null = null;

  if (!provider) {
    issues.push(issue('NO_PROVIDER', 'error', 'Repository Provider が見つかりません。'));
  }

  let originHost: string | null = null;
  try {
    originHost = parseRepositoryUrl(input.originUrl).host;
  } catch (err) {
    issues.push(
      issue(
        'INVALID_ORIGIN_URL',
        'error',
        'origin URL を GitHub / GitLab repository URL として解釈できません。',
        err instanceof Error ? err.message : undefined,
      ),
    );
  }

  if (provider && originHost) {
    try {
      const providerHost = baseUrlHost(provider.baseUrl);
      if (providerHost !== originHost) {
        issues.push(
          issue(
            'PROVIDER_ORIGIN_MISMATCH',
            'error',
            'origin URL の host と Repository Provider の base URL が一致しません。',
            `${originHost} != ${providerHost}`,
          ),
        );
      }
    } catch (err) {
      issues.push(
        issue(
          'NO_PROVIDER',
          'error',
          'Repository Provider の base URL を解釈できません。',
          err instanceof Error ? err.message : undefined,
        ),
      );
    }
  }

  const localClonePath = input.localClonePath.trim();
  if (!localClonePath || !path.isAbsolute(localClonePath)) {
    issues.push(
      issue('LOCAL_CLONE_NOT_ABSOLUTE', 'error', 'local clone path は絶対パスで指定してください。'),
    );
  }
  const localCloneIsAbsolute = Boolean(localClonePath && path.isAbsolute(localClonePath));
  const localCloneState = localCloneIsAbsolute ? await isDirectory(localClonePath) : null;
  if (localCloneIsAbsolute && localCloneState === null) {
    issues.push(issue('LOCAL_CLONE_MISSING', 'error', 'local clone path が存在しません。'));
  } else if (localCloneIsAbsolute && !localCloneState) {
    issues.push(
      issue(
        'LOCAL_CLONE_NOT_DIRECTORY',
        'error',
        'local clone path は directory を指定してください。',
      ),
    );
  } else if (localCloneIsAbsolute) {
    try {
      const insideWorkTree = await runGit(['rev-parse', '--is-inside-work-tree'], localClonePath);
      if (insideWorkTree !== 'true') {
        issues.push(
          issue('NOT_GIT_WORK_TREE', 'error', 'local clone path は git work tree ではありません。'),
        );
      }
    } catch (err) {
      issues.push(
        issue(
          'NOT_GIT_WORK_TREE',
          'error',
          'local clone path で git work tree を確認できません。',
          err instanceof Error ? err.message : undefined,
        ),
      );
    }

    try {
      gitRemoteOriginUrl = await runGit(['remote', 'get-url', 'origin'], localClonePath);
    } catch (err) {
      issues.push(
        issue(
          'GIT_REMOTE_ORIGIN_MISSING',
          'error',
          'git remote origin を取得できません。',
          err instanceof Error ? err.message : undefined,
        ),
      );
    }

    try {
      const status = await runGit(['status', '--porcelain=v1'], localClonePath);
      isDirty = status.length > 0;
    } catch (err) {
      issues.push(
        issue(
          'GIT_STATUS_FAILED',
          'warning',
          'git status の確認に失敗しました。',
          err instanceof Error ? err.message : undefined,
        ),
      );
    }
  }

  if (gitRemoteOriginUrl) {
    try {
      const inputKey = normalizeRepositoryKey(input.originUrl);
      const remoteKey = normalizeRepositoryKey(gitRemoteOriginUrl);
      if (inputKey !== remoteKey) {
        issues.push(
          issue(
            'ORIGIN_MISMATCH',
            input.allowOriginMismatch ? 'warning' : 'error',
            '入力された origin URL と local clone の remote origin が一致しません。',
            gitRemoteOriginUrl,
          ),
        );
      }
    } catch {
      // URL parse errors are already surfaced separately.
    }
  }

  const worktreeRootPath = input.worktreeRootPath.trim();
  if (!worktreeRootPath || !path.isAbsolute(worktreeRootPath)) {
    issues.push(
      issue('WORKTREE_ROOT_INVALID', 'error', 'worktree root は絶対パスで指定してください。'),
    );
  } else if (localCloneIsAbsolute) {
    const relative = path.relative(localClonePath, worktreeRootPath);
    if (!relative || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      issues.push(
        issue(
          'WORKTREE_ROOT_INSIDE_CLONE',
          'error',
          'worktree root は local clone path の外側を指定してください。',
        ),
      );
    }
  }

  return {
    ok: !issues.some((candidate) => candidate.severity === 'error'),
    issues,
    gitRemoteOriginUrl,
    isDirty,
  };
}
