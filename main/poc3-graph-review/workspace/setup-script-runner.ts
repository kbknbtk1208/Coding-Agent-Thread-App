import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { RepositorySetupScript } from '../../../shared/poc3-domain/repository';

export interface SetupScriptRunInput {
  script: RepositorySetupScript;
  worktreePath: string;
  worktreeRootPath: string;
}

export interface SetupScriptRunResult {
  code: number;
}

function resolveCwd(input: SetupScriptRunInput): string {
  return input.script.cwdMode === 'worktreeRoot' ? input.worktreeRootPath : input.worktreePath;
}

function resolveShell(script: RepositorySetupScript): 'powershell' | 'cmd' | 'bash' | 'zsh' {
  if (script.shell === 'systemDefault') {
    return process.platform === 'win32' ? 'powershell' : 'bash';
  }
  return script.shell;
}

async function writeTempScript(
  script: RepositorySetupScript,
  shell: 'powershell' | 'cmd' | 'bash' | 'zsh',
): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), 'poc3-setup-script');
  await fs.promises.mkdir(tmpDir, { recursive: true });
  const extension = shell === 'powershell' ? '.ps1' : shell === 'cmd' ? '.cmd' : '.sh';
  const fileName = `setup-${Date.now()}-${randomUUID()}${extension}`;
  const filePath = path.join(tmpDir, fileName);
  await fs.promises.writeFile(filePath, script.scriptText, { encoding: 'utf8' });
  if (shell === 'bash' || shell === 'zsh') {
    try {
      await fs.promises.chmod(filePath, 0o755);
    } catch {
      // ignore chmod failures on Windows
    }
  }
  return filePath;
}

export async function runSetupScript(
  input: SetupScriptRunInput,
  onLog: (line: string) => void,
): Promise<SetupScriptRunResult> {
  const shell = resolveShell(input.script);
  const cwd = resolveCwd(input);
  const scriptPath = await writeTempScript(input.script, shell);

  const { command, args } = buildShellInvocation(shell, scriptPath);
  onLog(`[setup] ${command} ${args.join(' ')} (cwd=${cwd})`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: process.env,
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line) {
          onLog(line);
        }
      }
    });
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line) {
          onLog(line);
        }
      }
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      resolve({ code: code ?? -1 });
      fs.promises.unlink(scriptPath).catch(() => undefined);
    });
  });
}

function buildShellInvocation(
  shell: 'powershell' | 'cmd' | 'bash' | 'zsh',
  scriptPath: string,
): { command: string; args: string[] } {
  if (shell === 'powershell') {
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    };
  }
  if (shell === 'cmd') {
    return { command: 'cmd.exe', args: ['/d', '/c', scriptPath] };
  }
  return { command: shell, args: [scriptPath] };
}
