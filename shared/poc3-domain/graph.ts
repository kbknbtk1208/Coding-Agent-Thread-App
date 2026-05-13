import type { RevisionContext } from './revision';
import type { ReviewWorkspaceListItem } from './review-workspace';
import type {
  GraphEdgeLayerClassification,
  GraphLayerRenderSnapshot,
  GraphNodeLayerClassification,
} from './layer-profile';

export const INITIAL_GRAPH_SCOPE_KEY = 'initial:diff-plus-1-hop:v1';

export type AnalysisRunStatus = 'queued' | 'running' | 'completed' | 'failed';
export type AnalysisRunPhase =
  | 'diffScope'
  | 'program'
  | 'extract'
  | 'buildGraph'
  | 'layout'
  | 'persist';

export interface AnalysisRunSnapshot {
  analysisRunId: string;
  revisionId: string;
  scopeKey: string;
  status: AnalysisRunStatus;
  phase: AnalysisRunPhase;
  progress: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CodeGraphSnapshot {
  graphSnapshotId: string;
  revisionId: string;
  scopeKey: string;
  status: 'ready' | 'partial' | 'failed';
  nodes: CodeGraphNode[];
  edges: CodeGraphEdge[];
  companionFiles?: CodeCompanionFile[];
  limits: GraphLimitSummary;
  diagnostics: GraphDiagnostic[];
  createdAt: string;
  updatedAt: string;
}

export type CodeFileRole = 'product' | 'test';
export type CodeRelationSource = 'import' | 'graph-edge' | 'filename-heuristic';
export type CodeRelationDisplayMode = 'diff' | 'code';

export interface CodeCompanionFile {
  relationId: string;
  ownerNodeId: string;
  ownerFilePath: string;
  ownerRole: CodeFileRole;
  companionRole: CodeFileRole;
  companionFilePath: string;
  companionNodeIds: string[];
  hiddenNodeIds: string[];
  source: CodeRelationSource;
  displayMode: CodeRelationDisplayMode;
  existsInWorkspaceHead: boolean;
  existsInDiff: boolean;
}

export type CodeGraphNodeKind =
  | 'module'
  | 'function'
  | 'method'
  | 'component'
  | 'hook'
  | 'file-scope'
  | 'external'
  | 'external-symbol';

export type CodeGraphDiffStatus = 'changed' | 'related' | 'module' | 'file-scope' | 'external';

export type CodeGraphEdgeKind =
  | 'imports'
  | 'exports'
  | 'calls'
  | 'constructs'
  | 'renders'
  | 'reads'
  | 'typeReferences'
  | 'apiHttp'
  | 'apiRpc'
  | 'apiGraphql';

export interface CodeGraphNode {
  nodeId: string;
  stableSymbolId: string;
  parentNodeId: string | null;
  kind: CodeGraphNodeKind;
  label: string;
  filePath: string | null;
  declarationRange: SourceRange | null;
  diffStatus: CodeGraphDiffStatus;
  isDiffNode: boolean;
  changedLineNumbers: number[];
  badges: {
    changedLines: number;
    remoteThreadCount: number;
    findingCount: number;
    hasCompanionCode?: boolean;
  };
}

export interface CodeGraphEdge {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: CodeGraphEdgeKind;
  confidence: 'high' | 'medium' | 'low';
  usage?: {
    filePath: string;
    range: SourceRange;
    imported: boolean;
    importSource: string | null;
  };
  transport?: CodeGraphEdgeTransport;
}

export interface CodeGraphEdgeTransport {
  kind: 'http' | 'rpc' | 'graphql';
  routePattern: string | null;
  confidence: 'high' | 'medium' | 'low';
  source: 'shared-schema' | 'url-literal' | 'runtime';
}

export interface SourceRange {
  filePath: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface GraphLimitSummary {
  nodeLimit: number;
  edgeLimit: number;
  omittedNodeCount: number;
  omittedEdgeCount: number;
  reason: 'none' | 'nodeLimit' | 'edgeLimit' | 'analysisTimeout';
}

export interface GraphDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  filePath?: string | null;
}

export interface LayoutSnapshot {
  layoutSnapshotId: string;
  graphSnapshotId: string;
  engine: string;
  positions: Record<string, GraphNodeLayout>;
  viewport: GraphRenderSnapshot['viewport'];
  createdAt: string;
  updatedAt: string;
}

export interface GraphNodeLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphRenderSnapshot {
  revisionId: string;
  graphSnapshotId: string;
  scopeKey: string;
  status: 'ready' | 'partial' | 'failed';
  nodes: GraphRenderNode[];
  edges: GraphRenderEdge[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  } | null;
  limits: GraphLimitSummary;
  diagnostics: GraphDiagnostic[];
  layers?: GraphLayerRenderSnapshot | null;
}

export interface GraphRenderNode extends CodeGraphNode {
  position: { x: number; y: number };
  size: { width: number; height: number };
  extent: 'parent' | null;
  layer?: GraphNodeLayerClassification | null;
}

export interface GraphRenderEdge extends CodeGraphEdge {
  label: string | null;
  layer?: GraphEdgeLayerClassification | null;
}

export type GraphAnalysisEvent =
  | {
      type: 'analysis.snapshot';
      analysisRunId: string;
      revisionId: string;
      scopeKey: string;
      status: AnalysisRunStatus;
      phase: AnalysisRunPhase;
      message: string | null;
    }
  | {
      type: 'graph.ready';
      revisionId: string;
      scopeKey: string;
      graphSnapshotId: string;
    };

export interface GraphWorkspaceView {
  workspace: ReviewWorkspaceListItem;
  revision: RevisionContext;
  analysis: AnalysisRunSnapshot | null;
  graph: GraphRenderSnapshot | null;
}
