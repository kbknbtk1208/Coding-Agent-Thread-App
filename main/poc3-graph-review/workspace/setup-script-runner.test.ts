import { describe, expect, it } from 'vitest';
import { buildShellInvocation, resolveSetupShell } from './setup-script-runner';
import type { RepositorySetupScript } from '../../../shared/poc3-domain/repository';

function setupScript(shell: RepositorySetupScript['shell']): RepositorySetupScript {
  return {
    scriptText: 'npm install',
    shell,
    cwdMode: 'worktreePath',
  };
}

describe('resolveSetupShell', () => {
  it('resolves systemDefault to PowerShell on Windows', () => {
    expect(resolveSetupShell(setupScript('systemDefault'), 'win32')).toBe('powershell');
  });

  it('resolves systemDefault to bash on macOS and Linux', () => {
    expect(resolveSetupShell(setupScript('systemDefault'), 'darwin')).toBe('bash');
    expect(resolveSetupShell(setupScript('systemDefault'), 'linux')).toBe('bash');
  });

  it('keeps explicitly configured shells', () => {
    expect(resolveSetupShell(setupScript('zsh'), 'darwin')).toBe('zsh');
  });
});

describe('buildShellInvocation', () => {
  it('uses Windows PowerShell on Windows', () => {
    expect(buildShellInvocation('powershell', 'C:\\Temp\\setup.ps1', 'win32')).toEqual({
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'C:\\Temp\\setup.ps1'],
    });
  });

  it('uses PowerShell Core on macOS and Linux when PowerShell is explicit', () => {
    expect(buildShellInvocation('powershell', '/tmp/setup.ps1', 'darwin')).toEqual({
      command: 'pwsh',
      args: ['-NoProfile', '-File', '/tmp/setup.ps1'],
    });
    expect(buildShellInvocation('powershell', '/tmp/setup.ps1', 'linux')).toEqual({
      command: 'pwsh',
      args: ['-NoProfile', '-File', '/tmp/setup.ps1'],
    });
  });

  it('runs POSIX shells with the script path as the only argument', () => {
    expect(buildShellInvocation('bash', '/tmp/setup.sh', 'darwin')).toEqual({
      command: 'bash',
      args: ['/tmp/setup.sh'],
    });
  });
});
