import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import { TextDecoder } from 'util';
import type {
  WorkspaceEditorKind,
  WorkspaceEditorLaunchMode,
} from '../../../shared/poc3-domain/review-workspace';

export interface OpenExternalEditorInput {
  editor: WorkspaceEditorKind;
  mode: WorkspaceEditorLaunchMode;
  worktreePath: string;
}

export type ExternalEditorLaunchResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'editorUnavailable' | 'launchFailed';
      message: string;
    };

export interface ResolvedCodeCommand {
  kind: 'native' | 'cmdShim';
  command: string;
}

const LAUNCH_TIMEOUT_MS = 3000;
const MAX_STDERR_LENGTH = 2048;

export class ExternalEditorLauncher {
  async openWorkspace(input: OpenExternalEditorInput): Promise<ExternalEditorLaunchResult> {
    if (input.editor !== 'vscode') {
      return {
        ok: false,
        reason: 'editorUnavailable',
        message: '指定された editor はサポートされていません。',
      };
    }

    const resolved = await resolveCodeCommand();
    if (!resolved) {
      return {
        ok: false,
        reason: 'editorUnavailable',
        message: 'code コマンドが見つかりません。VS Code の PATH 設定を確認してください。',
      };
    }

    const args = input.mode === 'newWindow' ? ['-n', input.worktreePath] : [input.worktreePath];
    return launchResolvedCommand(resolved, args, input.worktreePath);
  }
}

export function resolveCodeCommand(): Promise<ResolvedCodeCommand | null> {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    const child = spawn(finder, ['code'], { shell: false, windowsHide: true });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const command = selectCodeCommandCandidate(
        stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
        process.platform,
      );
      if (!command) {
        resolve(null);
        return;
      }
      resolve(toResolvedCodeCommand(command));
    });
  });
}

export function selectCodeCommandCandidate(
  candidates: string[],
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (platform !== 'win32') {
    return candidates[0] ?? null;
  }

  const executable = candidates.find((candidate) => {
    const extension = path.extname(candidate).toLowerCase();
    return extension === '.exe' || extension === '.cmd' || extension === '.bat';
  });
  return executable ?? null;
}

function toResolvedCodeCommand(command: string): ResolvedCodeCommand {
  const extension = path.extname(command).toLowerCase();
  return {
    kind: extension === '.cmd' || extension === '.bat' ? 'cmdShim' : 'native',
    command,
  };
}

export function launchResolvedCommand(
  resolved: ResolvedCodeCommand,
  args: string[],
  worktreePath: string,
): Promise<ExternalEditorLaunchResult> {
  if (resolved.kind === 'cmdShim') {
    const modeArgs = args[0] === '-n' ? '-n ' : '';
    const commandLine = `""${resolved.command}" ${modeArgs}"%POC3_WORKTREE_PATH%""`;
    return waitForLaunchProcess(
      spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', commandLine], {
        env: {
          ...process.env,
          POC3_WORKTREE_PATH: worktreePath,
        },
        shell: false,
        windowsHide: true,
        windowsVerbatimArguments: true,
      }),
    );
  }

  return waitForLaunchProcess(
    spawn(resolved.command, args, {
      shell: false,
      windowsHide: true,
    }),
  );
}

function waitForLaunchProcess(
  child: ChildProcessWithoutNullStreams,
): Promise<ExternalEditorLaunchResult> {
  return new Promise((resolve) => {
    let settled = false;
    const stderrChunks: Buffer[] = [];
    const finish = (result: ExternalEditorLaunchResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: true }), LAUNCH_TIMEOUT_MS);

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      finish({
        ok: false,
        reason: err.code === 'ENOENT' ? 'editorUnavailable' : 'launchFailed',
        message:
          err.code === 'ENOENT'
            ? 'code コマンドが見つかりません。VS Code の PATH 設定を確認してください。'
            : `VS Code の起動に失敗しました。${err.message}`,
      });
    });
    child.on('close', (code) => {
      if (code === 0) {
        finish({ ok: true });
        return;
      }
      const detail = trimOutput(decodeProcessOutput(Buffer.concat(stderrChunks))).trim();
      finish({
        ok: false,
        reason: 'launchFailed',
        message: detail
          ? `VS Code の起動に失敗しました。${detail}`
          : 'VS Code の起動に失敗しました。',
      });
    });
  });
}

function trimOutput(value: string): string {
  return value.length <= MAX_STDERR_LENGTH ? value : value.slice(value.length - MAX_STDERR_LENGTH);
}

function decodeProcessOutput(output: Buffer): string {
  if (process.platform === 'win32') {
    return new TextDecoder('shift_jis').decode(output);
  }
  return new TextDecoder('utf-8').decode(output);
}
