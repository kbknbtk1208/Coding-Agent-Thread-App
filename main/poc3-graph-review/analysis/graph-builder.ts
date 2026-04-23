import { randomUUID } from 'crypto';
import type {
  CodeGraphEdge,
  CodeGraphNode,
  CodeGraphSnapshot,
  GraphDiagnostic,
  GraphLimitSummary,
} from '../../../shared/poc3-domain/graph';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import type { DependencyExtractionResult, ExtractedSymbolNode } from './dependency-extractor';
import { normalizeRepoPath } from './graph-id';
import { snapshotEdgeId, snapshotNodeId, stableSymbolId } from './graph-id';

const INITIAL_GRAPH_NODE_LIMIT = 150;
const INITIAL_GRAPH_EDGE_LIMIT = 400;
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function nowIso(): string {
  return new Date().toISOString();
}

function moduleNodeId(filePath: string): string {
  return snapshotNodeId(
    stableSymbolId({ filePath, symbolName: '(module)', kind: 'module', startLine: 0 }),
  );
}

function toSymbolNode(symbol: ExtractedSymbolNode, parentNodeId: string): CodeGraphNode {
  const stableId = stableSymbolId({
    filePath: symbol.filePath,
    symbolName: symbol.name,
    kind: symbol.kind,
    startLine: symbol.range.startLine,
  });
  return {
    nodeId: snapshotNodeId(stableId),
    stableSymbolId: stableId,
    parentNodeId,
    kind: symbol.kind,
    label: symbol.name,
    filePath: symbol.filePath,
    declarationRange: symbol.range,
    diffStatus: symbol.isDiffNode ? 'changed' : 'related',
    isDiffNode: symbol.isDiffNode,
    badges: {
      changedLines: symbol.changedLines,
      remoteThreadCount: 0,
      findingCount: 0,
    },
  };
}

function createModuleNode(filePath: string, changedLines: number): CodeGraphNode {
  const stableId = stableSymbolId({
    filePath,
    symbolName: '(module)',
    kind: 'module',
    startLine: 0,
  });
  return {
    nodeId: snapshotNodeId(stableId),
    stableSymbolId: stableId,
    parentNodeId: null,
    kind: 'module',
    label: filePath.split('/').pop() ?? filePath,
    filePath,
    declarationRange: {
      filePath,
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 1,
    },
    diffStatus: changedLines > 0 ? 'module' : 'related',
    isDiffNode: false,
    badges: {
      changedLines,
      remoteThreadCount: 0,
      findingCount: 0,
    },
  };
}

function isTypeScriptPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return Array.from(TYPESCRIPT_EXTENSIONS).some((extension) => normalized.endsWith(extension));
}

function collectChangedLineCounts(sourceSnapshot: ReviewSourceSnapshot): Map<string, number> {
  const changedLineCounts = new Map<string, number>();

  for (const file of sourceSnapshot.changedFiles) {
    const filePath = normalizeRepoPath(file.path);
    if (!isTypeScriptPath(filePath)) {
      continue;
    }
    const changedLines = new Set(file.hunks.flatMap((hunk) => hunk.changedNewLines));
    changedLineCounts.set(filePath, changedLines.size);
  }

  return changedLineCounts;
}

export function buildInitialGraph(input: {
  revisionId: string;
  sourceSnapshot: ReviewSourceSnapshot;
  extraction: DependencyExtractionResult;
  diagnostics: GraphDiagnostic[];
}): CodeGraphSnapshot {
  const diagnostics = [...input.diagnostics, ...input.extraction.diagnostics];
  const symbolByKey = new Map(input.extraction.symbols.map((symbol) => [symbol.key, symbol]));
  const diffKeys = new Set(
    input.extraction.symbols.filter((symbol) => symbol.isDiffNode).map((symbol) => symbol.key),
  );
  const selectedKeys = new Set(diffKeys);

  for (const edge of input.extraction.calls) {
    if (diffKeys.has(edge.sourceKey)) {
      selectedKeys.add(edge.targetKey);
    }
    if (diffKeys.has(edge.targetKey)) {
      selectedKeys.add(edge.sourceKey);
    }
  }

  const selectedSymbols = Array.from(selectedKeys)
    .map((key) => symbolByKey.get(key))
    .filter((symbol): symbol is ExtractedSymbolNode => !!symbol)
    .sort((a, b) => {
      const aScore = a.isDiffNode ? 100 : 0;
      const bScore = b.isDiffNode ? 100 : 0;
      return (
        bScore - aScore ||
        a.filePath.localeCompare(b.filePath) ||
        a.range.startLine - b.range.startLine
      );
    });

  const limitApplied = selectedSymbols.length > INITIAL_GRAPH_NODE_LIMIT;
  const limitedSymbols = selectedSymbols.slice(0, INITIAL_GRAPH_NODE_LIMIT);
  const limitedKeys = new Set(limitedSymbols.map((symbol) => symbol.key));
  const nodes: CodeGraphNode[] = [];
  const changedLineCounts = collectChangedLineCounts(input.sourceSnapshot);
  const changedModulePaths = new Set(
    Array.from(changedLineCounts.keys()).filter((filePath) => isTypeScriptPath(filePath)),
  );
  const modulePaths = new Set<string>(changedModulePaths);

  for (const symbol of limitedSymbols) {
    modulePaths.add(symbol.filePath);
  }

  for (const imported of input.extraction.imports) {
    if (!imported.targetFilePath) {
      continue;
    }
    if (
      changedModulePaths.has(imported.sourceFilePath) ||
      changedModulePaths.has(imported.targetFilePath)
    ) {
      modulePaths.add(imported.sourceFilePath);
      modulePaths.add(imported.targetFilePath);
    }
  }

  for (const filePath of Array.from(modulePaths).sort()) {
    nodes.push(createModuleNode(filePath, changedLineCounts.get(filePath) ?? 0));
  }
  for (const symbol of limitedSymbols) {
    nodes.push(toSymbolNode(symbol, moduleNodeId(symbol.filePath)));
  }

  const edges: CodeGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const keyToNodeId = new Map(
    limitedSymbols.map((symbol) => [
      symbol.key,
      toSymbolNode(symbol, moduleNodeId(symbol.filePath)).nodeId,
    ]),
  );
  const modulePathToNodeId = new Map(
    Array.from(modulePaths).map((filePath) => [filePath, moduleNodeId(filePath)]),
  );

  for (const imported of input.extraction.imports) {
    if (!imported.targetFilePath || imported.sourceFilePath === imported.targetFilePath) {
      continue;
    }
    if (!modulePaths.has(imported.sourceFilePath) || !modulePaths.has(imported.targetFilePath)) {
      continue;
    }
    const sourceNodeId = modulePathToNodeId.get(imported.sourceFilePath);
    const targetNodeId = modulePathToNodeId.get(imported.targetFilePath);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }
    const edgeId = snapshotEdgeId(sourceNodeId, targetNodeId, 'imports');
    if (edgeKeys.has(edgeId)) {
      continue;
    }
    edgeKeys.add(edgeId);
    edges.push({
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind: 'imports',
      confidence: imported.confidence,
    });
  }

  for (const call of input.extraction.calls) {
    if (!limitedKeys.has(call.sourceKey) || !limitedKeys.has(call.targetKey)) {
      continue;
    }
    const sourceNodeId = keyToNodeId.get(call.sourceKey);
    const targetNodeId = keyToNodeId.get(call.targetKey);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }
    const edgeId = snapshotEdgeId(sourceNodeId, targetNodeId, 'calls');
    if (edgeKeys.has(edgeId)) {
      continue;
    }
    edgeKeys.add(edgeId);
    edges.push({
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind: 'calls',
      confidence: call.confidence,
    });
  }

  const limitedEdges = edges.slice(0, INITIAL_GRAPH_EDGE_LIMIT);
  const limits: GraphLimitSummary = {
    nodeLimit: INITIAL_GRAPH_NODE_LIMIT,
    edgeLimit: INITIAL_GRAPH_EDGE_LIMIT,
    omittedNodeCount: Math.max(0, selectedSymbols.length - limitedSymbols.length),
    omittedEdgeCount: Math.max(0, edges.length - limitedEdges.length),
    reason:
      selectedSymbols.length > limitedSymbols.length
        ? 'nodeLimit'
        : edges.length > limitedEdges.length
          ? 'edgeLimit'
          : 'none',
  };

  if (limitApplied) {
    diagnostics.push({
      code: 'GRAPH_NODE_LIMIT_EXCEEDED',
      message: 'Graph node 数が上限を超えたため一部を省略しました。',
      severity: 'warning',
    });
  }

  const timestamp = nowIso();
  return {
    graphSnapshotId: randomUUID(),
    revisionId: input.revisionId,
    scopeKey: INITIAL_GRAPH_SCOPE_KEY,
    status: 'ready',
    nodes,
    edges: limitedEdges,
    limits,
    diagnostics,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
