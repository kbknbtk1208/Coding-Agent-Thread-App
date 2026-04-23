import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface WorktreePlan {
  worktreePath: string;
}

export interface WorktreePathInput {
  worktreeRootPath: string;
  repoName: string;
  reviewKind: 'pr' | 'mr';
  reviewId: string;
  headSha: string;
}

export interface GitCommandOutput {
  stdout: string;
  stderr: string;
  code: number;
}

export function planWorktreePath(input: WorktreePathInput): WorktreePlan {
  const shortSha = input.headSha.slice(0, 7);
  const safeRepoName = input.repoName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const folder = `${safeRepoName}-${input.reviewKind}-${input.reviewId}-${shortSha}`;
  return {
    worktreePath: path.join(input.worktreeRootPath, folder),
  };
}

export function runGitCommand(
  cwd: string,
  args: string[],
  onLog?: (line: string) => void,
): Promise<GitCommandOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, shell: false });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (onLog) {
        for (const line of chunk.split(/\r?\n/)) {
          if (line) {
            onLog(line);
          }
        }
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (onLog) {
        for (const line of chunk.split(/\r?\n/)) {
          if (line) {
            onLog(line);
          }
        }
      }
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

export async function ensureDirectoryExists(targetPath: string): Promise<void> {
  await fs.promises.mkdir(targetPath, { recursive: true });
}

export async function fetchHeadRef(
  localClonePath: string,
  headRef: string | null,
  headSha: string,
  onLog: (line: string) => void,
): Promise<void> {
  const target = headRef ?? headSha;
  onLog(`git fetch origin ${target}`);
  const result = await runGitCommand(localClonePath, ['fetch', 'origin', target], onLog);
  if (result.code !== 0) {
    throw new Error(
      `git fetch origin ${target} が失敗しました (exit ${result.code}): ${result.stderr.trim()}`,
    );
  }
}

export async function addWorktree(
  localClonePath: string,
  worktreePath: string,
  headSha: string,
  onLog: (line: string) => void,
): Promise<void> {
  onLog(`git worktree add --detach ${worktreePath} ${headSha}`);
  const result = await runGitCommand(
    localClonePath,
    ['worktree', 'add', '--detach', worktreePath, headSha],
    onLog,
  );
  if (result.code !== 0) {
    throw new Error(
      `git worktree add が失敗しました (exit ${result.code}): ${result.stderr.trim()}`,
    );
  }
}

export async function removeWorktree(
  localClonePath: string,
  worktreePath: string,
  force: boolean,
  onLog?: (line: string) => void,
): Promise<void> {
  const args = force
    ? ['worktree', 'remove', '--force', worktreePath]
    : ['worktree', 'remove', worktreePath];
  onLog?.(`git ${args.join(' ')}`);
  const result = await runGitCommand(localClonePath, args, onLog);
  if (result.code !== 0) {
    throw new Error(
      `git worktree remove が失敗しました (exit ${result.code}): ${result.stderr.trim()}`,
    );
  }
}

export async function verifyHeadSha(
  worktreePath: string,
  expectedHeadSha: string,
  onLog: (line: string) => void,
): Promise<string> {
  onLog('git rev-parse HEAD');
  const result = await runGitCommand(worktreePath, ['rev-parse', 'HEAD'], onLog);
  if (result.code !== 0) {
    throw new Error(`git rev-parse HEAD が失敗しました: ${result.stderr.trim()}`);
  }
  const actual = result.stdout.trim();
  if (actual.toLowerCase() !== expectedHeadSha.toLowerCase()) {
    throw new Error(
      `worktree HEAD (${actual}) が provider head sha (${expectedHeadSha}) と一致しません。`,
    );
  }
  return actual;
}
