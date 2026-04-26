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

  it('関数 body 内の calls/constructs/renders usage を抽出し、未使用 import は edge にしない', () => {
    const worktreePath = createTempWorkspace();
    const appPath = path.join(worktreePath, 'src', 'App.tsx');
    const depsPath = path.join(worktreePath, 'src', 'deps.tsx');

    fs.writeFileSync(
      appPath,
      [
        "import { Child, Service, unused, used } from './deps';",
        '',
        'export function App() {',
        '  used();',
        '  new Service();',
        '  return <Child />;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      depsPath,
      [
        'export function used() {',
        '  return 1;',
        '}',
        '',
        'export function unused() {',
        '  return 2;',
        '}',
        '',
        'export class Service {',
        '  run() {',
        '    return null;',
        '  }',
        '}',
        '',
        'export function Child() {',
        '  return null;',
        '}',
        '',
      ].join('\n'),
      'utf8',
    );

    const program = ts.createProgram([appPath, depsPath], {
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
              startLine: 4,
              endLine: 4,
              changedLines: [4],
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

    const app = extraction.symbols.find((symbol) => symbol.name === 'App');
    expect(app?.changedLineNumbers).toEqual([4]);

    const targetNameByKey = new Map(extraction.symbols.map((symbol) => [symbol.key, symbol.name]));
    expect(extraction.calls.map((edge) => targetNameByKey.get(edge.targetKey))).toEqual(['used']);
    expect(extraction.constructs?.map((edge) => targetNameByKey.get(edge.targetKey))).toEqual([
      'Service',
    ]);
    expect(extraction.renders?.map((edge) => targetNameByKey.get(edge.targetKey))).toEqual([
      'Child',
    ]);

    const allTargets = [
      ...extraction.calls,
      ...(extraction.constructs ?? []),
      ...(extraction.renders ?? []),
    ].map((edge) => targetNameByKey.get(edge.targetKey));
    expect(allTargets).not.toContain('unused');
    expect(extraction.calls[0]?.usage).toMatchObject({
      filePath: 'src/App.tsx',
      imported: true,
      importSource: './deps',
    });
  });

  it('const arrow function は export const を含む宣言範囲で保持する', () => {
    const worktreePath = createTempWorkspace();
    const appPath = path.join(worktreePath, 'src', 'App.tsx');
    const depsPath = path.join(worktreePath, 'src', 'deps.ts');

    fs.writeFileSync(
      appPath,
      [
        "import { used } from './deps';",
        '',
        'export const App = () => {',
        '  return used();',
        '};',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      depsPath,
      ['export function used() {', '  return 1;', '}', ''].join('\n'),
      'utf8',
    );

    const program = ts.createProgram([appPath, depsPath], {
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
              startLine: 4,
              endLine: 4,
              changedLines: [4],
            },
          ],
        },
      ],
      diagnostics: [],
    };

    const extraction = extractDependencies({ worktreePath, program, diffScope });
    const app = extraction.symbols.find((symbol) => symbol.name === 'App');

    expect(app?.range).toMatchObject({
      startLine: 3,
      startColumn: 1,
      endLine: 5,
    });
    expect(app?.changedLineNumbers).toEqual([4]);
  });
});
