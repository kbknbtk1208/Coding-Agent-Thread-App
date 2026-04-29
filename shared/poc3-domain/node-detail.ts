import type { GraphRenderEdge, GraphRenderNode, SourceRange } from './graph';
import type { ReviewRemoteThreadSummary } from './source-snapshot';

export type NodeDetailPrimaryView =
  | 'function'
  | 'file-scope'
  | 'external'
  | 'diff'
  | 'code'
  | 'overview';
export type NodeDetailStatus = 'ready' | 'partial' | 'unavailable';

export type NodeCodeExcerptLanguage = 'ts' | 'tsx' | 'mts' | 'cts' | 'text';
export type NodeDetailViewMode = 'function' | 'context' | 'file';

export interface NodeDetailSnapshot {
  reviewWorkspaceId: string;
  revisionId: string;
  scopeKey: string;
  nodeId: string;
  node: GraphRenderNode;
  primaryView: NodeDetailPrimaryView;
  status: NodeDetailStatus;
  summary: NodeDetailSummary;
  functionCode: NodeFunctionCode | null;
  fileContext: NodeFileContext | null;
  diffSummary: NodeDiffSummary;
  codeExcerpt: NodeCodeExcerpt | null;
  diffExcerpt: NodeDiffExcerpt | null;
  relations: NodeRelationSummary;
  threads: NodeThreadSummary;
  findings: NodeFindingSummary[];
  diagnostics: NodeDetailDiagnostic[];
}

export interface NodeDetailSummary {
  title: string;
  subtitle: string;
  kindLabel: string;
  diffStatusLabel: string;
  filePath: string | null;
  declarationRange: SourceRange | null;
}

export interface NodeCodeExcerpt {
  filePath: string;
  language: NodeCodeExcerptLanguage;
  startLine: number;
  endLine: number;
  highlightedLineNumbers: number[];
  content: string;
}

export interface NodeFunctionCode {
  filePath: string;
  language: NodeCodeExcerptLanguage;
  declarationRange: SourceRange;
  startLine: number;
  endLine: number;
  highlightedLineNumbers: number[];
  content: string;
}

export interface NodeFileContext {
  filePath: string;
  language: NodeCodeExcerptLanguage;
  mode: NodeDetailViewMode;
  startLine: number;
  endLine: number;
  highlightedLineNumbers: number[];
  content: string;
}

export interface NodeDiffExcerpt {
  filePath: string;
  patch: string;
  hunkHeaders: string[];
  changedLineNumbers: number[];
}

export interface NodeDiffSummary {
  hasDiff: boolean;
  changedLineNumbers: number[];
  hunks: NodeDiffHunkSummary[];
  patch: string | null;
}

export interface NodeDiffHunkSummary {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changedNewLines: number[];
  changedOldLines: number[];
}

export interface NodeRelationSummary {
  incoming: NodeRelationItem[];
  outgoing: NodeRelationItem[];
  incomingOverflowCount: number;
  outgoingOverflowCount: number;
}

export interface NodeRelationItem {
  edge: GraphRenderEdge;
  nodeId: string;
  label: string;
  kind: GraphRenderNode['kind'];
  isDiffNode: boolean;
}

export interface NodeThreadSummary {
  remote: ReviewRemoteThreadSummary[];
  local: LocalNodeThreadSummary[];
  agent: AgentNodeThreadSummary[];
}

export interface LocalNodeThreadSummary {
  threadId: string;
  title: string;
  status: 'open' | 'resolved';
  line: number | null;
}

export interface AgentNodeThreadSummary {
  threadId: string;
  summary: string;
  status: 'open' | 'resolved';
  line: number | null;
}

export interface NodeFindingSummary {
  findingId: string;
  severity: 'low' | 'medium' | 'high';
  category: string;
  confidence: string;
  title: string;
  body: string;
  suggestion?: string;
  line: number | null;
  endLine: number | null;
  side: 'old' | 'new' | null;
  status: 'open' | 'resolved';
}

export interface NodeDetailDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}
