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
  changedLineNumbers: number[];
  changedLines: number;
}

export interface ExtractedUsageEdge {
  sourceKey: string;
  targetKey: string;
  kind: 'calls' | 'constructs' | 'renders';
  confidence: 'high' | 'medium' | 'low';
  usage: {
    filePath: string;
    range: SourceRange;
    imported: boolean;
    importSource: string | null;
  };
}

export type ExtractedCallEdge = ExtractedUsageEdge;

export interface ExtractedImportEdge {
  sourceFilePath: string;
  targetModule: string;
  targetFilePath: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface DependencyExtractionResult {
  symbols: ExtractedSymbolNode[];
  calls: ExtractedCallEdge[];
  constructs?: ExtractedUsageEdge[];
  renders?: ExtractedUsageEdge[];
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
  const rangeNode =
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent)
      ? node.parent.parent
      : node;
  const start = sourceFile.getLineAndCharacterOfPosition(rangeNode.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(rangeNode.getEnd());
  return {
    filePath: normalizeRepoPath(toRepoRelativePath(worktreePath, sourceFile.fileName)),
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function changedLinesInRange(range: SourceRange, diffScope: DiffScope): number[] {
  const file = diffScope.files.find((candidate) => candidate.filePath === range.filePath);
  if (!file) {
    return [];
  }
  const changed = new Set<number>();
  for (const changedRange of file.changedRanges) {
    for (const line of changedRange.changedLines) {
      if (line >= range.startLine && line <= range.endLine) {
        changed.add(line);
      }
    }
  }
  return Array.from(changed).sort((a, b) => a - b);
}

function isInNodeModules(fileName: string): boolean {
  return /[\\/]node_modules[\\/]/.test(fileName);
}

function getDeclarationName(node: ts.Node): string | null {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
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
      ts.isClassDeclaration(node) ||
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
    ts.isClassDeclaration(node) ||
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

function rangeForUsage(
  worktreePath: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
): SourceRange {
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

function getImportSourceByLocalName(sourceFile: ts.SourceFile): Map<string, string> {
  const importSourceByLocalName = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const importClause = statement.importClause;
    if (!importClause) {
      continue;
    }
    if (importClause.name) {
      importSourceByLocalName.set(importClause.name.text, statement.moduleSpecifier.text);
    }
    const namedBindings = importClause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        importSourceByLocalName.set(element.name.text, statement.moduleSpecifier.text);
      }
    }
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      importSourceByLocalName.set(namedBindings.name.text, statement.moduleSpecifier.text);
    }
  }
  return importSourceByLocalName;
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
            ts.isMethodDeclaration(node) ||
            ts.isMethodSignature(node) ||
            ts.isClassDeclaration(node)
              ? 'method'
              : 'function';
          const range = rangeForNode(input.worktreePath, sourceFile, node);
          const changedLineNumbers = changedLinesInRange(range, input.diffScope);
          const key = `${filePath}:${name}:${range.startLine}`;
          const extracted: ExtractedSymbolNode = {
            key,
            name,
            kind: ts.isClassDeclaration(node) ? 'method' : classifySymbol(name, fallbackKind),
            filePath,
            range,
            isDiffNode: changedLineNumbers.length > 0,
            changedLineNumbers,
            changedLines: changedLineNumbers.length,
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
  const constructs: ExtractedUsageEdge[] = [];
  const renders: ExtractedUsageEdge[] = [];
  const imports: ExtractedImportEdge[] = [];
  const currentSymbolStack: string[] = [];

  for (const sourceFile of input.program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || isInNodeModules(sourceFile.fileName)) {
      continue;
    }
    const sourceFilePath = normalizeRepoPath(
      toRepoRelativePath(input.worktreePath, sourceFile.fileName),
    );
    const importSourceByLocalName = getImportSourceByLocalName(sourceFile);

    const resolveTargetKey = (target: ts.Node): string | null => {
      const symbol = checker.getSymbolAtLocation(target);
      const aliased =
        symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      const declaration = aliased?.declarations?.[0];
      return declaration
        ? (symbolKeyByDeclaration.get(declaration) ?? null)
        : aliased
          ? (symbolKeyByTsSymbol.get(aliased) ?? null)
          : null;
    };

    const usageImportSource = (target: ts.Node): string | null => {
      if (ts.isIdentifier(target)) {
        return importSourceByLocalName.get(target.text) ?? null;
      }
      if (ts.isPropertyAccessExpression(target) && ts.isIdentifier(target.expression)) {
        return importSourceByLocalName.get(target.expression.text) ?? null;
      }
      return null;
    };

    const pushUsage = (
      collection: ExtractedUsageEdge[],
      kind: ExtractedUsageEdge['kind'],
      target: ts.Node,
      usageNode: ts.Node,
    ) => {
      if (currentSymbolStack.length === 0) {
        return;
      }
      const sourceKey = currentSymbolStack[currentSymbolStack.length - 1];
      const targetKey = resolveTargetKey(target);
      if (targetKey && targetKey !== sourceKey) {
        const importSource = usageImportSource(target);
        collection.push({
          sourceKey,
          targetKey,
          kind,
          confidence: 'high',
          usage: {
            filePath: sourceFilePath,
            range: rangeForUsage(input.worktreePath, sourceFile, usageNode),
            imported: importSource !== null,
            importSource,
          },
        });
        return;
      }
      if (!targetKey) {
        diagnostics.push({
          code: `${kind.toUpperCase()}_SYMBOL_UNRESOLVED`,
          message: '利用先 symbol を解決できませんでした。',
          severity: 'info',
          filePath: sourceFilePath,
        });
      }
    };

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
        pushUsage(calls, 'calls', node.expression, node);
      }

      if (ts.isNewExpression(node) && currentSymbolStack.length > 0) {
        pushUsage(constructs, 'constructs', node.expression, node);
      }

      if (
        ts.isJsxOpeningElement(node) &&
        currentSymbolStack.length > 0 &&
        !/^[a-z]/.test(node.tagName.getText(sourceFile))
      ) {
        pushUsage(renders, 'renders', node.tagName, node);
      }

      if (
        ts.isJsxSelfClosingElement(node) &&
        currentSymbolStack.length > 0 &&
        !/^[a-z]/.test(node.tagName.getText(sourceFile))
      ) {
        pushUsage(renders, 'renders', node.tagName, node);
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
    constructs,
    renders,
    imports,
    diagnostics,
  };
}
