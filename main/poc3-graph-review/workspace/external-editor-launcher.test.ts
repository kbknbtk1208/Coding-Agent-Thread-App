import { EventEmitter } from 'events';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { launchResolvedCommand, selectCodeCommandCandidate } from './external-editor-launcher';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('child_process', () => ({
  spawn: spawnMock,
}));

function createProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (encoding: string) => void };
    stderr: EventEmitter & { setEncoding: (encoding: string) => void };
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  return child;
}

describe('launchResolvedCommand', () => {
  afterEach(() => {
    spawnMock.mockReset();
  });

  it('passes worktree path as one argument for native executables', async () => {
    const child = createProcess();
    spawnMock.mockReturnValueOnce(child);
    const launch = launchResolvedCommand(
      { kind: 'native', command: 'C:\\VS Code\\bin\\code.exe' },
      ['-n', 'C:\\work trees\\日本語 repo'],
      'C:\\work trees\\日本語 repo',
    );

    child.emit('close', 0);
    await expect(launch).resolves.toEqual({ ok: true });
    expect(spawnMock).toHaveBeenCalledWith(
      'C:\\VS Code\\bin\\code.exe',
      ['-n', 'C:\\work trees\\日本語 repo'],
      {
        shell: false,
        windowsHide: true,
      },
    );
  });

  it('passes worktree path through env for cmd shims', async () => {
    const child = createProcess();
    const worktreePath = 'C:\\worktrees\\repo & (^日本語^) !bang!';
    spawnMock.mockReturnValueOnce(child);
    const launch = launchResolvedCommand(
      { kind: 'cmdShim', command: 'C:\\Users\\me\\AppData\\Local\\Programs\\code.cmd' },
      ['-n', worktreePath],
      worktreePath,
    );

    child.emit('close', 0);
    await expect(launch).resolves.toEqual({ ok: true });
    expect(spawnMock).toHaveBeenCalledWith(
      process.env.ComSpec ?? 'cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        '""C:\\Users\\me\\AppData\\Local\\Programs\\code.cmd" -n "%POC3_WORKTREE_PATH%""',
      ],
      expect.objectContaining({
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: true,
        env: expect.objectContaining({
          POC3_WORKTREE_PATH: worktreePath,
        }),
      }),
    );
  });

  it('maps ENOENT spawn errors to editorUnavailable', async () => {
    const child = createProcess();
    spawnMock.mockReturnValueOnce(child);
    const launch = launchResolvedCommand(
      { kind: 'native', command: 'code' },
      ['-n', 'C:\\repo'],
      'C:\\repo',
    );

    child.emit('error', Object.assign(new Error('not found'), { code: 'ENOENT' }));
    await expect(launch).resolves.toMatchObject({
      ok: false,
      reason: 'editorUnavailable',
    });
  });

  it('maps non-zero exits to launchFailed', async () => {
    const child = createProcess();
    spawnMock.mockReturnValueOnce(child);
    const launch = launchResolvedCommand(
      { kind: 'native', command: 'code' },
      ['-n', 'C:\\repo'],
      'C:\\repo',
    );

    child.stderr.emit('data', 'bad launch');
    child.emit('close', 1);
    await expect(launch).resolves.toEqual({
      ok: false,
      reason: 'launchFailed',
      message: 'VS Code の起動に失敗しました。bad launch',
    });
  });
});

describe('selectCodeCommandCandidate', () => {
  it('skips extensionless shell scripts and selects code.cmd on Windows', () => {
    expect(
      selectCodeCommandCandidate(
        [
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code',
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd',
        ],
        'win32',
      ),
    ).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd');
  });

  it('prefers the first executable Windows candidate', () => {
    expect(
      selectCodeCommandCandidate(
        [
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code',
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.exe',
          'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.cmd',
        ],
        'win32',
      ),
    ).toBe('C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\bin\\code.exe');
  });

  it('keeps extensionless CLI candidates on macOS and Linux', () => {
    expect(selectCodeCommandCandidate(['/usr/local/bin/code'], 'darwin')).toBe(
      '/usr/local/bin/code',
    );
    expect(selectCodeCommandCandidate(['/usr/bin/code'], 'linux')).toBe('/usr/bin/code');
  });

  it('returns null on Windows when no executable shim is available', () => {
    expect(selectCodeCommandCandidate(['C:\\VS Code\\bin\\code'], 'win32')).toBeNull();
  });
});
