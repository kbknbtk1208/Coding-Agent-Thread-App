import ts from 'typescript';
import type { GraphDiagnostic, SourceRange } from '../../../shared/poc3-domain/graph';
import type { DiffScope } from './diff-scope-resolver';
import { normalizeRepoPath, toRepoRelativePath } from './graph-id';

export interface ExtractedSymbolNode {
  key: string;
  name: string;
  kind: 'function' | 'method' | 'component' | 'hook';
  filePath: string;
  range: SourceRange;
  isDiffNode: boolean;
  changedLines: number;
}

export interface ExtractedCallEdge {
  sourceKey: string;
  targetKey: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedImportEdge {
  sourceFilePath: string;
  targetModule: string;
  targetFilePath: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface DependencyExtractionResult {
  symbols: ExtractedSymbolNode[];
  calls: ExtractedCallEdge[];
  imports: ExtractedImportEdge[];
  diagnostics: GraphDiagnostic[];
}

function classifySymbol(
  name: string,
  fallback: 'function' | 'method',
): ExtractedSymbolNode['kind'] {
  if (/^use[A-Z0-9]/.test(name)) {
    return 'hook';
  }
  if (/^[A-Z]/.test(name)) {
    return 'component';
  }
  return fallback;
}

function rangeForNode(worktreePath: string, sourceFile: ts.SourceFile, node: ts.Node): SourceRange {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    filePath: normalizeRepoPath(toRepoRelativePath(worktreePath, sourceFile.fileName)),
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function changedLineCount(range: SourceRange, diffScope: DiffScope): number {
  const file = diffScope.files.find((candidate) => candidate.filePath === range.filePath);
  if (!file) {
    return 0;
  }
  const changed = new Set<number>();
  for (const changedRange of file.changedRanges) {
    for (const line of changedRange.changedLines) {
      if (line >= range.startLine && line <= range.endLine) {
        changed.add(line);
      }
    }
  }
  return changed.size;
}

function isInNodeModules(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName);
}

function getDeclarationName(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node)) &&
    node.name
  ) {
    return node.name.getText();
  }
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return node.name.text;
  }
  return null;
}

function getNameNode(node: ts.Node): ts.Node | null {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node)) &&
    node.name
  ) {
    return node.name;
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
    return node.name;
  }
  return null;
}

function shouldCollectNode(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isMethodSignature(node) ||
    (ts.isVariableDeclaration(node) &&
      !!node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))
  );
}

function resolveImportTargetFilePath(input: {
  worktreePath: string;
  program: ts.Program;
  sourceFile: ts.SourceFile;
  moduleSpecifier: string;
}): string | null {
  if (!input.moduleSpecifier.startsWith('.')) {
    return null;
  }

  const resolved = ts.resolveModuleName(
    input.moduleSpecifier,
    input.sourceFile.fileName,
    input.program.getCompilerOptions(),
    ts.sys,
  ).resolvedModule;

  if (!resolved || resolved.isExternalLibraryImport || isInNodeModules(resolved.resolvedFileName)) {
    return null;
  }

  return normalizeRepoPath(toRepoRelativePath(input.worktreePath, resolved.resolvedFileName));
}

export function extractDependencies(input: {
  worktreePath: string;
  program: ts.Program;
  diffScope: DiffScope;
}): DependencyExtractionResult {
  const checker = input.program.getTypeChecker();
  const diagnostics: GraphDiagnostic[] = [];
  const symbols: ExtractedSymbolNode[] = [];
  const symbolKeyByDeclaration = new Map<ts.Declaration, string>();
  const symbolKeyByTsSymbol = new Map<ts.Symbol, string>();

  for (const sourceFile of input.program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || isInNodeModules(sourceFile.fileName)) {
      continue;
    }
    const filePath = normalizeRepoPath(toRepoRelativePath(input.worktreePath, sourceFile.fileName));

    const visit = (node: ts.Node) => {
      if (shouldCollectNode(node)) {
        const name = getDeclarationName(node);
        const nameNode = getNameNode(node);
        if (name && nameNode) {
          const fallbackKind =
            ts.isMethodDeclaration(node) || ts.isMethodSignature(node) ? 'method' : 'function';
          const range = rangeForNode(input.worktreePath, sourceFile, node);
          const changedLines = changedLineCount(range, input.diffScope);
          const key = `${filePath}:${name}:${range.startLine}`;
          const extracted: ExtractedSymbolNode = {
            key,
            name,
            kind: classifySymbol(name, fallbackKind),
            filePath,
            range,
            isDiffNode: changedLines > 0,
            changedLines,
          };
          symbols.push(extracted);
          symbolKeyByDeclaration.set(node as ts.Declaration, key);
          const tsSymbol = checker.getSymbolAtLocation(nameNode);
          if (tsSymbol) {
            symbolKeyByTsSymbol.set(tsSymbol, key);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }

  const calls: ExtractedCallEdge[] = [];
  const imports: ExtractedImportEdge[] = [];
  const currentSymbolStack: string[] = [];

  for (const sourceFile of input.program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || isInNodeModules(sourceFile.fileName)) {
      continue;
    }
    const sourceFilePath = normalizeRepoPath(
      toRepoRelativePath(input.worktreePath, sourceFile.fileName),
    );

    const visit = (node: ts.Node) => {
      let pushed = false;
      if (shouldCollectNode(node)) {
        const key = symbolKeyByDeclaration.get(node as ts.Declaration);
        if (key) {
          currentSymbolStack.push(key);
          pushed = true;
        }
      }

      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.push({
          sourceFilePath,
          targetModule: node.moduleSpecifier.text,
          targetFilePath: resolveImportTargetFilePath({
            worktreePath: input.worktreePath,
            program: input.program,
            sourceFile,
            moduleSpecifier: node.moduleSpecifier.text,
          }),
          confidence: node.moduleSpecifier.text.startsWith('.') ? 'medium' : 'high',
        });
      }

      if (ts.isCallExpression(node) && currentSymbolStack.length > 0) {
        const sourceKey = currentSymbolStack[currentSymbolStack.length - 1];
        const symbol = checker.getSymbolAtLocation(node.expression);
        const aliased =
          symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
            ? checker.getAliasedSymbol(symbol)
            : symbol;
        const declaration = aliased?.declarations?.[0];
        const targetKey = declaration
          ? symbolKeyByDeclaration.get(declaration)
          : aliased
            ? symbolKeyByTsSymbol.get(aliased)
            : null;
        if (targetKey && targetKey !== sourceKey) {
          calls.push({ sourceKey, targetKey, confidence: 'high' });
        } else if (!targetKey) {
          diagnostics.push({
            code: 'CALL_SYMBOL_UNRESOLVED',
            message: '呼び出し先 symbol を解決できませんでした。',
            severity: 'info',
            filePath: sourceFilePath,
          });
        }
      }

      ts.forEachChild(node, visit);
      if (pushed) {
        currentSymbolStack.pop();
      }
    };
    ts.forEachChild(sourceFile, visit);
  }

  return {
    symbols,
    calls,
    imports,
    diagnostics,
  };
}
