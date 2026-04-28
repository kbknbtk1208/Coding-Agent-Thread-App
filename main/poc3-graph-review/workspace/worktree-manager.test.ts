import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { removeWorktree } from './worktree-manager';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

function createMockChild(code = 0, stderr = '') {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (encoding: string) => void };
    stderr: EventEmitter & { setEncoding: (encoding: string) => void };
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => undefined });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: () => undefined });
  process.nextTick(() => {
    if (stderr) {
      child.stderr.emit('data', stderr);
    }
    child.emit('close', code);
  });
  return child;
}

function queueChildren(children: Array<{ code: number; stderr?: string }>): void {
  let index = 0;
  spawnMock.mockImplementation(() => {
    const next = children[Math.min(index, children.length - 1)];
    index += 1;
    return createMockChild(next.code, next.stderr ?? '');
  });
}

describe('removeWorktree', () => {
  afterEach(() => {
    spawnMock.mockReset();
  });

  it('runs git worktree remove without force by default', async () => {
    queueChildren([{ code: 0 }]);

    await removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false);

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', 'C:\\worktrees\\repo-pr-1'],
      { cwd: 'C:\\repo', shell: false },
    );
  });

  it('runs git worktree remove --force when requested', async () => {
    queueChildren([{ code: 0 }]);

    await removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', true);

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '--force', 'C:\\worktrees\\repo-pr-1'],
      { cwd: 'C:\\repo', shell: false },
    );
  });

  it('throws when git worktree remove fails', async () => {
    queueChildren([{ code: 1, stderr: 'contains modified files' }]);

    await expect(removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false)).rejects.toThrow(
      'contains modified files',
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('retries when git worktree remove fails with Permission denied and eventually succeeds', async () => {
    queueChildren([
      { code: 255, stderr: "error: failed to delete 'foo': Permission denied" },
      { code: 0 },
    ]);

    await removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false);

    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when Permission denied persists', async () => {
    queueChildren([{ code: 255, stderr: "error: failed to delete 'foo': Permission denied" }]);

    await expect(removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false)).rejects.toThrow(
      'Permission denied',
    );
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry when stderr does not match a retriable pattern', async () => {
    queueChildren([{ code: 1, stderr: 'contains untracked files' }]);

    await expect(removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false)).rejects.toThrow(
      'contains untracked files',
    );
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
