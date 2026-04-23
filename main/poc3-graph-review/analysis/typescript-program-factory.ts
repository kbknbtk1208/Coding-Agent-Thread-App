import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import type { GraphDiagnostic } from '../../../shared/poc3-domain/graph';

const IGNORED_DIRECTORIES = new Set(['node_modules', '.next', 'dist', 'build', 'out', '.git']);

export interface TypeScriptProgramResult {
  program: ts.Program;
  rootNames: string[];
  diagnostics: GraphDiagnostic[];
}

function findNearestTsconfig(startDir: string, stopDir: string): string | null {
  let current = startDir;
  while (current.startsWith(stopDir)) {
    const candidate = path.join(current, 'tsconfig.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function shouldUseFile(filePath: string): boolean {
  return !filePath.split(/[\\/]/).some((segment) => IGNORED_DIRECTORIES.has(segment));
}

export function createTypeScriptProgram(
  worktreePath: string,
  changedFiles: string[],
): TypeScriptProgramResult {
  const diagnostics: GraphDiagnostic[] = [];
  const absoluteChangedFiles = changedFiles
    .map((filePath) => path.join(worktreePath, filePath))
    .filter((filePath) => shouldUseFile(filePath) && fs.existsSync(filePath));

  if (absoluteChangedFiles.length === 0) {
    return {
      program: ts.createProgram([], {}),
      rootNames: [],
      diagnostics: [
        {
          code: 'DIFF_SCOPE_FILES_MISSING',
          message: '変更ファイルが worktree 内に見つかりませんでした。',
          severity: 'warning',
        },
      ],
    };
  }

  const tsconfigs = new Map<string, number>();
  for (const filePath of absoluteChangedFiles) {
    const configPath = findNearestTsconfig(path.dirname(filePath), worktreePath);
    if (configPath) {
      tsconfigs.set(configPath, (tsconfigs.get(configPath) ?? 0) + 1);
    }
  }

  const selectedTsconfig = Array.from(tsconfigs.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!selectedTsconfig) {
    diagnostics.push({
      code: 'TSCONFIG_NOT_FOUND',
      message: 'tsconfig.json が見つからないため変更ファイルのみで Program を構築します。',
      severity: 'warning',
    });
    return {
      program: ts.createProgram(absoluteChangedFiles, {
        allowJs: false,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
        target: ts.ScriptTarget.Latest,
        skipLibCheck: true,
      }),
      rootNames: absoluteChangedFiles,
      diagnostics,
    };
  }

  if (tsconfigs.size > 1) {
    diagnostics.push({
      code: 'MULTIPLE_TSCONFIG_PARTIAL_ANALYSIS',
      message: '複数 tsconfig にまたがるため、最も多くの変更ファイルを含む設定で解析します。',
      severity: 'warning',
    });
  }

  const configFile = ts.readConfigFile(selectedTsconfig, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(selectedTsconfig),
    {
      skipLibCheck: true,
      noEmit: true,
    },
    selectedTsconfig,
  );
  if (parsed.errors.length > 0) {
    diagnostics.push({
      code: 'TSCONFIG_DIAGNOSTICS',
      message: ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, '\n'),
      severity: 'warning',
    });
  }
  return {
    program: ts.createProgram(parsed.fileNames.filter(shouldUseFile), parsed.options),
    rootNames: parsed.fileNames,
    diagnostics,
  };
}
