import fs from 'fs';
import os from 'os';
import path from 'path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { extractDependencies } from './dependency-extractor';
import type { DiffScope } from './diff-scope-resolver';

const tempDirs: string[] = [];

function createTempWorkspace(): string {
  const worktreePath = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-extractor-'));
  tempDirs.push(worktreePath);
  fs.mkdirSync(path.join(worktreePath, 'src'), { recursive: true });
  return worktreePath;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe('extractDependencies', () => {
  it('相対 import の解決先ファイルを保持し、外部 import は node 化しないため null を返す', () => {
    const worktreePath = createTempWorkspace();
    const appPath = path.join(worktreePath, 'src', 'App.tsx');
    const hookPath = path.join(worktreePath, 'src', 'useThing.ts');

    fs.writeFileSync(
      appPath,
      [
        "import React from 'react';",
        "import { useThing } from './useThing';",
        '',
        'export function App() {',
        '  return useThing();',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      hookPath,
      ['export function useThing() {', '  return 1;', '}', ''].join('\n'),
      'utf8',
    );

    const program = ts.createProgram([appPath, hookPath], {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ESNext,
      allowJs: false,
      skipLibCheck: true,
    });
    const diffScope: DiffScope = {
      revisionId: 'revision-1',
      files: [
        {
          filePath: 'src/App.tsx',
          status: 'modified',
          changedRanges: [
            {
              startLine: 1,
              endLine: 2,
              changedLines: [1, 2],
            },
          ],
        },
      ],
      diagnostics: [],
    };

    const extraction = extractDependencies({
      worktreePath,
      program,
      diffScope,
    });

    expect(extraction.imports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceFilePath: 'src/App.tsx',
          targetModule: 'react',
          targetFilePath: null,
        }),
        expect.objectContaining({
          sourceFilePath: 'src/App.tsx',
          targetModule: './useThing',
          targetFilePath: 'src/useThing.ts',
        }),
      ]),
    );
  });
});
