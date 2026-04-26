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
import type {
  DependencyExtractionResult,
  ExtractedSymbolNode,
  ExtractedUsageEdge,
} from './dependency-extractor';
import { normalizeRepoPath } from './graph-id';
import { snapshotEdgeId, snapshotNodeId, stableSymbolId } from './graph-id';

const INITIAL_GRAPH_NODE_LIMIT = 150;
const INITIAL_GRAPH_EDGE_LIMIT = 400;
const TYPESCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function nowIso(): string {
  return new Date().toISOString();
}

function toSymbolNode(symbol: ExtractedSymbolNode): CodeGraphNode {
  const stableId = stableSymbolId({
    filePath: symbol.filePath,
    symbolName: symbol.name,
    kind: symbol.kind,
    startLine: symbol.range.startLine,
  });
  return {
    nodeId: snapshotNodeId(stableId),
    stableSymbolId: stableId,
    parentNodeId: null,
    kind: symbol.kind,
    label: symbol.name,
    filePath: symbol.filePath,
    declarationRange: symbol.range,
    diffStatus: symbol.isDiffNode ? 'changed' : 'related',
    isDiffNode: symbol.isDiffNode,
    changedLineNumbers: symbol.changedLineNumbers,
    badges: {
      changedLines: symbol.changedLines,
      remoteThreadCount: 0,
      findingCount: 0,
    },
  };
}

function createFileScopeNode(filePath: string, changedLineNumbers: number[]): CodeGraphNode {
  const startLine = Math.min(...changedLineNumbers);
  const endLine = Math.max(...changedLineNumbers);
  const stableId = stableSymbolId({
    filePath,
    symbolName: '(file-scope)',
    kind: 'file-scope',
    startLine,
  });
  return {
    nodeId: snapshotNodeId(stableId),
    stableSymbolId: stableId,
    parentNodeId: null,
    kind: 'file-scope',
    label: `${filePath.split('/').pop() ?? filePath} file scope`,
    filePath,
    declarationRange: {
      filePath,
      startLine,
      startColumn: 1,
      endLine,
      endColumn: 1,
    },
    diffStatus: 'file-scope',
    isDiffNode: true,
    changedLineNumbers,
    badges: {
      changedLines: changedLineNumbers.length,
      remoteThreadCount: 0,
      findingCount: 0,
    },
  };
}

function isTypeScriptPath(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  return Array.from(TYPESCRIPT_EXTENSIONS).some((extension) => normalized.endsWith(extension));
}

function collectChangedLines(sourceSnapshot: ReviewSourceSnapshot): Map<string, number[]> {
  const changedLinesByFile = new Map<string, number[]>();

  for (const file of sourceSnapshot.changedFiles) {
    const filePath = normalizeRepoPath(file.path);
    if (!isTypeScriptPath(filePath)) {
      continue;
    }
    const changedLines = new Set(file.hunks.flatMap((hunk) => hunk.changedNewLines));
    changedLinesByFile.set(
      filePath,
      Array.from(changedLines).sort((a, b) => a - b),
    );
  }

  return changedLinesByFile;
}

function usageEdges(extraction: DependencyExtractionResult): ExtractedUsageEdge[] {
  return [...extraction.calls, ...(extraction.constructs ?? []), ...(extraction.renders ?? [])];
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
  const extractedUsageEdges = usageEdges(input.extraction);

  for (const edge of extractedUsageEdges) {
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

  const changedLinesByFile = collectChangedLines(input.sourceSnapshot);
  const fallbackNodes: CodeGraphNode[] = [];
  for (const [filePath, changedLines] of Array.from(changedLinesByFile.entries())) {
    if (!isTypeScriptPath(filePath)) {
      continue;
    }
    const covered = new Set<number>();
    for (const symbol of input.extraction.symbols) {
      if (symbol.filePath !== filePath || !symbol.isDiffNode) {
        continue;
      }
      for (const line of symbol.changedLineNumbers) {
        covered.add(line);
      }
    }
    const uncovered = changedLines.filter((line: number) => !covered.has(line));
    if (uncovered.length > 0) {
      fallbackNodes.push(createFileScopeNode(filePath, uncovered));
    }
  }

  const sortedFallbackNodes = fallbackNodes.sort((a, b) => a.filePath!.localeCompare(b.filePath!));
  const limitedSymbols = selectedSymbols.slice(0, INITIAL_GRAPH_NODE_LIMIT);
  const remainingNodeLimit = Math.max(0, INITIAL_GRAPH_NODE_LIMIT - limitedSymbols.length);
  const limitedFallbackNodes = sortedFallbackNodes.slice(0, remainingNodeLimit);
  const limitedKeys = new Set(limitedSymbols.map((symbol) => symbol.key));
  const limitApplied =
    selectedSymbols.length > limitedSymbols.length ||
    sortedFallbackNodes.length > limitedFallbackNodes.length;
  const nodes: CodeGraphNode[] = [];
  for (const symbol of limitedSymbols) {
    nodes.push(toSymbolNode(symbol));
  }
  nodes.push(...limitedFallbackNodes);

  const edges: CodeGraphEdge[] = [];
  const edgeKeys = new Set<string>();
  const keyToNodeId = new Map(
    limitedSymbols.map((symbol) => [symbol.key, toSymbolNode(symbol).nodeId]),
  );

  for (const usageEdge of extractedUsageEdges) {
    if (!limitedKeys.has(usageEdge.sourceKey) || !limitedKeys.has(usageEdge.targetKey)) {
      continue;
    }
    const sourceNodeId = keyToNodeId.get(usageEdge.sourceKey);
    const targetNodeId = keyToNodeId.get(usageEdge.targetKey);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }
    const edgeId = snapshotEdgeId(sourceNodeId, targetNodeId, usageEdge.kind);
    if (edgeKeys.has(edgeId)) {
      continue;
    }
    edgeKeys.add(edgeId);
    edges.push({
      edgeId,
      sourceNodeId,
      targetNodeId,
      kind: usageEdge.kind,
      confidence: usageEdge.confidence,
      usage: usageEdge.usage,
    });
  }

  const limitedEdges = edges.slice(0, INITIAL_GRAPH_EDGE_LIMIT);
  const limits: GraphLimitSummary = {
    nodeLimit: INITIAL_GRAPH_NODE_LIMIT,
    edgeLimit: INITIAL_GRAPH_EDGE_LIMIT,
    omittedNodeCount:
      Math.max(0, selectedSymbols.length - limitedSymbols.length) +
      Math.max(0, sortedFallbackNodes.length - limitedFallbackNodes.length),
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
