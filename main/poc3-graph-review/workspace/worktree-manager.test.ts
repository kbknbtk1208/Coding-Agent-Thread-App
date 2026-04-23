import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
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

describe('removeWorktree', () => {
  it('runs git worktree remove without force by default', async () => {
    spawnMock.mockReturnValueOnce(createMockChild());

    await removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false);

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', 'C:\\worktrees\\repo-pr-1'],
      { cwd: 'C:\\repo', shell: false },
    );
  });

  it('runs git worktree remove --force when requested', async () => {
    spawnMock.mockReturnValueOnce(createMockChild());

    await removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', true);

    expect(spawnMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', '--force', 'C:\\worktrees\\repo-pr-1'],
      { cwd: 'C:\\repo', shell: false },
    );
  });

  it('throws when git worktree remove fails', async () => {
    spawnMock.mockReturnValueOnce(createMockChild(1, 'contains modified files'));

    await expect(removeWorktree('C:\\repo', 'C:\\worktrees\\repo-pr-1', false)).rejects.toThrow(
      'contains modified files',
    );
  });
});
