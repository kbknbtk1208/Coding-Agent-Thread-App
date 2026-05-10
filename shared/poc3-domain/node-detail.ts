import type { GraphRenderEdge, GraphRenderNode, SourceRange } from './graph';
import type {
  ReviewRemoteComment,
  ReviewRemoteThreadAnchorStatus,
  ReviewRemoteThreadLocation,
} from './source-snapshot';

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
  companion: NodeCompanionState | null;
}

export interface NodeCompanionSummary {
  relationId: string;
  role: 'product' | 'test';
  filePath: string;
  displayMode: 'diff' | 'code';
  existsInWorkspaceHead: boolean;
  existsInDiff: boolean;
  unavailableMessage: string | null;
}

export interface NodeCompanionState {
  targetRole: 'product' | 'test';
  toggleLabel: string;
  emptyMessage: string;
  companions: NodeCompanionSummary[];
}

export interface DiffAwareCodePaneSnapshot {
  reviewWorkspaceId: string;
  revisionId: string;
  scopeKey: string;
  summary: {
    filePath: string | null;
  };
  diffSummary: NodeDiffSummary;
  diffExcerpt: NodeDiffExcerpt | null;
  threads: NodeThreadSummary;
  findings: NodeFindingSummary[];
}

export interface NodeCompanionDetailSnapshot extends DiffAwareCodePaneSnapshot {
  ownerNodeId: string;
  relationId: string;
  role: 'product' | 'test';
  filePath: string;
  displayMode: 'diff' | 'code';
  source: NodeFileContext | NodeCodeExcerpt | null;
  diagnostics: NodeDetailDiagnostic[];
  testCases: TestCaseTreeNode[] | null;
}

export type TestCaseKind = 'describe' | 'it' | 'test';

export type TestCaseModifier = 'skip' | 'only' | 'todo' | 'each' | null;

export interface TestCaseTreeNode {
  kind: TestCaseKind;
  label: string;
  modifier: TestCaseModifier;
  line: number;
  endLine: number;
  children: TestCaseTreeNode[];
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

export interface NodeRemoteThreadSummary {
  providerThreadId: string;
  location: ReviewRemoteThreadLocation;
  anchorStatus: ReviewRemoteThreadAnchorStatus;
  isResolved: boolean | null;
  isOutdated: boolean | null;
  comments: ReviewRemoteComment[];
}

export interface NodePublishedRemoteThreadSummary {
  linkId: string;
  providerThreadId: string;
  providerCommentIds: string[];
  publishedAt: string;
  lastSyncedAt: string;
  status: 'active' | 'missingRemote';
  remoteThread: NodeRemoteThreadSummary | null;
}

export interface NodeThreadSummary {
  remote: NodeRemoteThreadSummary[];
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
  localThreadId: string;
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
  hasReplyableSession: boolean;
  isOutdated?: boolean;
  publishedRemoteThreads: NodePublishedRemoteThreadSummary[];
}

export interface NodeDetailDiagnostic {
  code: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
}
