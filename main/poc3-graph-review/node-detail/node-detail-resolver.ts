import fs from 'fs';
import path from 'path';
import type {
  GraphDiagnostic,
  GraphNodeLayout,
  GraphRenderEdge,
  GraphRenderNode,
  GraphRenderSnapshot,
  SourceRange,
} from '../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerpt,
  NodeCodeExcerptLanguage,
  NodeDetailDiagnostic,
  NodeDetailPrimaryView,
  NodeDetailSnapshot,
  NodeDetailStatus,
  NodeDetailSummary,
  NodeDetailViewMode,
  NodeDiffExcerpt,
  NodeDiffSummary,
  NodeFileContext,
  NodeFunctionCode,
  NodeRelationItem,
  NodeRelationSummary,
  NodePublishedRemoteThreadSummary,
  NodeRemoteThreadSummary,
  NodeThreadSummary,
} from '../../../shared/poc3-domain/node-detail';
import type {
  PublishedAgentThreadLink,
  PublishedRemoteThreadSummary,
} from '../../../shared/poc3-domain/published-agent-thread';
import type {
  DiffHunkRange,
  ReviewChangedFile,
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type {
  Poc3AgentReviewRun,
  Poc3AgentReviewThread,
} from '../../../shared/poc3-domain/agent-review';
import type { Poc3OutdatedAgentThread } from '../../../shared/poc3-domain/thread-retention';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import { fallbackGridLayout } from '../layout/elk-layout-service';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { isUnitOrIntegrationTestFile } from '../analysis/test-file-classifier';
import { buildPublishedThreadVisibility } from '../published-agent-thread/visibility';

export interface ResolveNodeDetailContext {
  workspace: ReviewWorkspace;
  revisionId: string;
  scopeKey: string;
  nodeId: string;
  viewMode?: NodeDetailViewMode;
  record: WorkspaceGraphRecord;
  renderSnapshot?: GraphRenderSnapshot;
  sourceSnapshot: ReviewSourceSnapshot | null;
  agentThreads?: Poc3AgentReviewThread[];
  outdatedAgentThreads?: Poc3OutdatedAgentThread[];
  runById?: Map<string, Poc3AgentReviewRun>;
  publishedAgentThreadLinks?: PublishedAgentThreadLink[];
}

export interface ResolveNodeDetailResult {
  ok: boolean;
  reason: 'nodeNotFound' | 'detailUnavailable' | null;
  message: string | null;
  detail: NodeDetailSnapshot | null;
}

const CONTEXT_EXPAND_LINES = 40;
const FILE_CONTEXT_LINE_LIMIT = 800;
const RELATION_LIMIT = 6;
const MAX_MODULE_HUNK_COUNT = 2;

export function resolveNodeDetail(context: ResolveNodeDetailContext): ResolveNodeDetailResult {
  const { record, nodeId, workspace, revisionId, scopeKey, sourceSnapshot } = context;
  const viewMode = context.viewMode ?? 'function';
  if (!record.graph) {
    return {
      ok: false,
      reason: 'detailUnavailable',
      message: 'Graph snapshot が見つかりません。',
      detail: null,
    };
  }

  const renderSnapshot = context.renderSnapshot ?? toRenderSnapshot(record);
  const renderNode = renderSnapshot.nodes.find((node) => node.nodeId === nodeId);
  if (!renderNode) {
    return {
      ok: false,
      reason: 'nodeNotFound',
      message: '指定された node が見つかりません。',
      detail: null,
    };
  }

  const diagnostics: NodeDetailDiagnostic[] = [];
  const changedFileByPath = new Map<string, ReviewChangedFile>();
  if (sourceSnapshot) {
    for (const file of sourceSnapshot.changedFiles) {
      changedFileByPath.set(file.path, file);
    }
  }

  const diffExcerpt = resolveDiffExcerpt(renderNode, changedFileByPath, diagnostics);
  const diffSummary = resolveDiffSummary(renderNode, changedFileByPath);
  const functionCode = resolveFunctionCode(renderNode, workspace, diagnostics);
  const fileContext = resolveFileContext(renderNode, workspace, diagnostics, viewMode);
  const codeExcerpt = toLegacyCodeExcerpt(functionCode, fileContext);
  const relations = resolveRelations(renderNode, renderSnapshot);
  const agentThreads = context.agentThreads ?? [];
  const outdatedAgentThreads = resolveOutdatedAgentThreadsForNode(
    renderNode,
    context.outdatedAgentThreads ?? [],
    agentThreads,
  );
  const allAgentThreads = [...agentThreads, ...outdatedAgentThreads.map((item) => item.thread)];
  const visibility = buildPublishedThreadVisibility({
    reviewWorkspaceId: workspace.reviewWorkspaceId,
    agentThreads: allAgentThreads,
    remoteThreads: sourceSnapshot?.remoteThreads ?? [],
    links: context.publishedAgentThreadLinks ?? [],
  });
  const summary = buildSummary(renderNode);
  const primaryView = pickPrimaryView(renderNode, functionCode, fileContext, codeExcerpt);
  const status = pickStatus(renderNode, functionCode, fileContext, codeExcerpt);
  const outdatedLocalThreadIds = new Set(
    outdatedAgentThreads.map((item) => item.thread.localThreadId),
  );
  const threads = resolveThreads(
    renderNode,
    sourceSnapshot
      ? {
          ...sourceSnapshot,
          remoteThreads: visibility.visibleRemoteThreads,
        }
      : null,
    allAgentThreads,
  );
  const companion = resolveCompanionState(renderNode, record, workspace);

  const detail: NodeDetailSnapshot = {
    reviewWorkspaceId: workspace.reviewWorkspaceId,
    revisionId,
    scopeKey,
    nodeId,
    node: renderNode,
    primaryView,
    status,
    summary,
    functionCode,
    fileContext,
    diffSummary,
    codeExcerpt,
    diffExcerpt,
    relations,
    threads,
    findings: allAgentThreads.map((thread) =>
      toNodeFindingSummary(thread, {
        isOutdated: outdatedLocalThreadIds.has(thread.localThreadId),
        hasReplyableSession: context.runById?.get(thread.runId)?.resultSource !== 'richText',
        publishedRemoteThreads: (
          visibility.publishedRemoteByLocalThreadId.get(thread.localThreadId) ?? []
        ).map(toNodePublishedRemoteThreadSummary),
      }),
    ),
    diagnostics,
    companion,
  };

  return { ok: true, reason: null, message: null, detail };
}

function resolveCompanionState(
  node: GraphRenderNode,
  record: WorkspaceGraphRecord,
  workspace: ReviewWorkspace,
): NodeDetailSnapshot['companion'] {
  const nodeFilePath = node.filePath ?? '';
  const ownerItems = (record.graph?.companionFiles ?? []).filter(
    (item) => item.ownerNodeId === node.nodeId || item.ownerFilePath === nodeFilePath,
  );
  const reverseItems = (record.graph?.companionFiles ?? []).filter(
    (item) =>
      item.companionNodeIds.includes(node.nodeId) ||
      item.hiddenNodeIds.includes(node.nodeId) ||
      item.companionFilePath === nodeFilePath,
  );
  const companions = ownerItems.length > 0 ? ownerItems : reverseItems;
  const fallbackTargetRole = isUnitOrIntegrationTestFile(nodeFilePath) ? 'product' : 'test';
  if (companions.length === 0) {
    if (!node.filePath || node.kind === 'external' || node.kind === 'external-symbol') {
      return null;
    }
    return {
      targetRole: fallbackTargetRole,
      toggleLabel: fallbackTargetRole === 'test' ? 'Test' : 'Product',
      emptyMessage:
        fallbackTargetRole === 'test'
          ? '対応するテストコードが存在しません'
          : '対応するプロダクトコードが存在しません',
      companions: [],
    };
  }

  const targetRole = ownerItems.length > 0 ? ownerItems[0].companionRole : companions[0].ownerRole;
  const emptyMessage =
    targetRole === 'test'
      ? '対応するテストコードが存在しません'
      : '対応するプロダクトコードが存在しません';
  return {
    targetRole,
    toggleLabel: targetRole === 'test' ? 'Test' : 'Product',
    emptyMessage,
    companions: companions.map((item) => {
      const filePath = ownerItems.length > 0 ? item.companionFilePath : item.ownerFilePath;
      const existsInWorkspaceHead = fs.existsSync(path.join(workspace.worktreePath, filePath));
      return {
        relationId: item.relationId,
        role: ownerItems.length > 0 ? item.companionRole : item.ownerRole,
        filePath,
        displayMode: item.displayMode,
        existsInWorkspaceHead,
        existsInDiff: item.existsInDiff,
        unavailableMessage: existsInWorkspaceHead ? null : 'worktree にファイルが存在しません',
      };
    }),
  };
}

function buildSummary(node: GraphRenderNode): NodeDetailSummary {
  const kindLabel = kindLabelFor(node.kind);
  const diffStatusLabel = diffStatusLabelFor(node.diffStatus);
  const subtitle =
    node.kind === 'module'
      ? (node.filePath ?? 'module')
      : node.filePath
        ? `${node.filePath}${formatRangeSuffix(node.declarationRange)}`
        : kindLabel;
  return {
    title: node.label,
    subtitle,
    kindLabel,
    diffStatusLabel,
    filePath: node.filePath,
    declarationRange: node.declarationRange,
  };
}

function kindLabelFor(kind: GraphRenderNode['kind']): string {
  switch (kind) {
    case 'module':
      return 'module';
    case 'function':
      return 'function';
    case 'method':
      return 'method';
    case 'component':
      return 'component';
    case 'hook':
      return 'hook';
    case 'file-scope':
      return 'file scope';
    case 'external-symbol':
      return 'external symbol';
    case 'external':
      return 'external';
    default:
      return String(kind);
  }
}

function diffStatusLabelFor(status: GraphRenderNode['diffStatus']): string {
  switch (status) {
    case 'changed':
      return 'diff';
    case 'related':
      return 'related';
    case 'module':
      return 'module';
    case 'file-scope':
      return 'file scope';
    case 'external':
      return 'external';
    default:
      return String(status);
  }
}

function formatRangeSuffix(range: SourceRange | null): string {
  if (!range) {
    return '';
  }
  return `:${range.startLine}-${range.endLine}`;
}

function pickPrimaryView(
  node: GraphRenderNode,
  functionCode: NodeFunctionCode | null,
  fileContext: NodeFileContext | null,
  code: NodeCodeExcerpt | null,
): NodeDetailPrimaryView {
  if (node.kind === 'external' || node.kind === 'external-symbol') {
    return 'external';
  }
  if (node.kind === 'file-scope') {
    return 'file-scope';
  }
  if (functionCode || fileContext || code) {
    return 'function';
  }
  return 'overview';
}

function pickStatus(
  node: GraphRenderNode,
  functionCode: NodeFunctionCode | null,
  fileContext: NodeFileContext | null,
  code: NodeCodeExcerpt | null,
): NodeDetailStatus {
  if (node.kind === 'external' || node.kind === 'external-symbol') {
    return 'ready';
  }
  if (node.kind === 'file-scope') {
    return fileContext || code ? 'ready' : 'partial';
  }
  if (functionCode) {
    return 'ready';
  }
  return code ? 'partial' : 'unavailable';
}

function resolveDiffExcerpt(
  node: GraphRenderNode,
  changedFileByPath: Map<string, ReviewChangedFile>,
  diagnostics: NodeDetailDiagnostic[],
): NodeDiffExcerpt | null {
  if (node.kind === 'external') {
    return null;
  }
  if (!node.filePath) {
    return null;
  }
  const changedFile = changedFileByPath.get(node.filePath);
  if (!changedFile) {
    return null;
  }

  const hunks = changedFile.hunks;
  if (hunks.length === 0 && !changedFile.patch) {
    return null;
  }

  const intersectedHunks = intersectHunks(node, hunks);
  const fallbackHunks = node.kind === 'module' || node.isDiffNode ? hunks : intersectedHunks;
  const hunkHeaders = fallbackHunks
    .map((hunk) => normalizeHunkHeader(hunk))
    .filter((header): header is string => header.length > 0);
  const changedLineNumbers = Array.from(
    new Set(
      (intersectedHunks.length > 0 ? intersectedHunks : fallbackHunks).flatMap(
        (hunk) => hunk.changedNewLines,
      ),
    ),
  ).sort((a, b) => a - b);

  if (changedFile.patch) {
    if (intersectedHunks.length > 0 || node.kind === 'module' || node.isDiffNode) {
      return {
        filePath: changedFile.path,
        patch: changedFile.patch,
        hunkHeaders,
        changedLineNumbers,
      };
    }
  }

  if (fallbackHunks.length === 0) {
    return null;
  }
  diagnostics.push({
    code: 'DIFF_PATCH_UNAVAILABLE',
    message: 'patch 本文を取得できなかったため、hunk metadata のみ表示しています。',
    severity: 'info',
  });
  return {
    filePath: changedFile.path,
    patch: '',
    hunkHeaders,
    changedLineNumbers,
  };
}

function intersectHunks(node: GraphRenderNode, hunks: DiffHunkRange[]): DiffHunkRange[] {
  if (hunks.length === 0) {
    return [];
  }
  if (node.kind === 'module') {
    return hunks.slice(0, MAX_MODULE_HUNK_COUNT);
  }
  const range = node.declarationRange;
  if (!range) {
    return hunks.slice(0, MAX_MODULE_HUNK_COUNT);
  }
  const intersected = hunks.filter((hunk) => {
    const hunkStart = hunk.newStart;
    const hunkEnd = hunk.newStart + Math.max(hunk.newLines - 1, 0);
    return hunkEnd >= range.startLine && hunkStart <= range.endLine;
  });
  return intersected.length > 0 ? intersected : [];
}

function normalizeHunkHeader(hunk: DiffHunkRange): string {
  if (typeof hunk.header === 'string' && hunk.header.startsWith('@@')) {
    return hunk.header;
  }
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
}

function resolveDiffSummary(
  node: GraphRenderNode,
  changedFileByPath: Map<string, ReviewChangedFile>,
): NodeDiffSummary {
  if (!node.filePath) {
    return { hasDiff: false, changedLineNumbers: [], hunks: [], patch: null };
  }
  const changedFile = changedFileByPath.get(node.filePath);
  const changedLineNumbers = Array.from(new Set(node.changedLineNumbers ?? [])).sort(
    (a, b) => a - b,
  );
  if (!changedFile) {
    return {
      hasDiff: changedLineNumbers.length > 0,
      changedLineNumbers,
      hunks: [],
      patch: null,
    };
  }
  const intersectedHunks = intersectHunks(node, changedFile.hunks);
  const fallbackHunks =
    node.kind === 'file-scope' && intersectedHunks.length === 0
      ? changedFile.hunks.slice(0, MAX_MODULE_HUNK_COUNT)
      : intersectedHunks;
  const hunkSource = fallbackHunks;
  const hasRelevantDiff = changedLineNumbers.length > 0 || hunkSource.length > 0;
  return {
    hasDiff: hasRelevantDiff,
    changedLineNumbers:
      changedLineNumbers.length > 0
        ? changedLineNumbers
        : Array.from(new Set(hunkSource.flatMap((hunk) => hunk.changedNewLines))).sort(
            (a, b) => a - b,
          ),
    hunks: hunkSource.map((hunk) => ({
      header: normalizeHunkHeader(hunk),
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      changedNewLines: hunk.changedNewLines,
      changedOldLines: hunk.changedOldLines,
    })),
    patch: hasRelevantDiff ? (changedFile.patch ?? null) : null,
  };
}

function resolveFunctionCode(
  node: GraphRenderNode,
  workspace: ReviewWorkspace,
  diagnostics: NodeDetailDiagnostic[],
): NodeFunctionCode | null {
  if (node.kind === 'external' || node.kind === 'external-symbol' || node.kind === 'file-scope') {
    return null;
  }
  if (!node.filePath) {
    return null;
  }
  if (node.kind === 'module') {
    return null;
  }
  const range = node.declarationRange;
  if (!range) {
    return null;
  }
  const absolutePath = path.isAbsolute(node.filePath)
    ? node.filePath
    : path.join(workspace.worktreePath, node.filePath);
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    diagnostics.push({
      code: 'CODE_EXCERPT_UNAVAILABLE',
      message: `worktree から file を読み込めませんでした: ${node.filePath}`,
      severity: 'warning',
    });
    return null;
  }
  const lines = content.split(/\r?\n/);
  if (range.startLine < 1 || range.endLine < range.startLine) {
    diagnostics.push({
      code: 'CODE_EXCERPT_UNAVAILABLE',
      message: 'declaration range が不正なため function code を取得できませんでした。',
      severity: 'warning',
    });
    return null;
  }
  const startIndex = Math.max(range.startLine - 1, 0);
  const endIndex = Math.min(range.endLine - 1, lines.length - 1);
  if (endIndex < startIndex) {
    return null;
  }
  const excerptLines = lines.slice(startIndex, endIndex + 1);
  return {
    filePath: node.filePath,
    language: detectLanguage(node.filePath),
    declarationRange: range,
    startLine: startIndex + 1,
    endLine: endIndex + 1,
    highlightedLineNumbers: node.changedLineNumbers ?? [],
    content: excerptLines.join('\n'),
  };
}

function resolveFileContext(
  node: GraphRenderNode,
  workspace: ReviewWorkspace,
  diagnostics: NodeDetailDiagnostic[],
  viewMode: NodeDetailViewMode,
): NodeFileContext | null {
  if (node.kind === 'external' || node.kind === 'external-symbol' || !node.filePath) {
    return null;
  }
  if (viewMode === 'function' && node.kind !== 'file-scope') {
    return null;
  }
  const absolutePath = path.isAbsolute(node.filePath)
    ? node.filePath
    : path.join(workspace.worktreePath, node.filePath);
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    diagnostics.push({
      code: 'FILE_CONTEXT_UNAVAILABLE',
      message: `worktree から file context を読み込めませんでした: ${node.filePath}`,
      severity: 'warning',
    });
    return null;
  }
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return null;
  }
  const highlightedLineNumbers = node.changedLineNumbers ?? [];
  const range = node.declarationRange;
  let startLine = range?.startLine ?? highlightedLineNumbers[0] ?? 1;
  let endLine = range?.endLine ?? highlightedLineNumbers[highlightedLineNumbers.length - 1] ?? 1;
  let mode = viewMode;

  if (node.kind === 'file-scope' && viewMode === 'function') {
    mode = 'context';
  }
  if (mode === 'context') {
    startLine = Math.max(1, startLine - CONTEXT_EXPAND_LINES);
    endLine = Math.min(lines.length, endLine + CONTEXT_EXPAND_LINES);
  }
  if (mode === 'file') {
    startLine = 1;
    endLine = Math.min(lines.length, FILE_CONTEXT_LINE_LIMIT);
    if (lines.length > FILE_CONTEXT_LINE_LIMIT) {
      diagnostics.push({
        code: 'FILE_CONTEXT_TRUNCATED',
        message: `file context は ${FILE_CONTEXT_LINE_LIMIT} 行まで表示しています。`,
        severity: 'info',
      });
    }
  }
  const startIndex = Math.max(0, startLine - 1);
  const endIndex = Math.max(startIndex, Math.min(lines.length - 1, endLine - 1));
  return {
    filePath: node.filePath,
    language: detectLanguage(node.filePath),
    mode,
    startLine: startIndex + 1,
    endLine: endIndex + 1,
    highlightedLineNumbers,
    content: lines.slice(startIndex, endIndex + 1).join('\n'),
  };
}

function toLegacyCodeExcerpt(
  functionCode: NodeFunctionCode | null,
  fileContext: NodeFileContext | null,
): NodeCodeExcerpt | null {
  const source = functionCode ?? fileContext;
  if (!source) {
    return null;
  }
  return {
    filePath: source.filePath,
    language: source.language,
    startLine: source.startLine,
    endLine: source.endLine,
    highlightedLineNumbers: source.highlightedLineNumbers,
    content: source.content,
  };
}

function detectLanguage(filePath: string): NodeCodeExcerptLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) {
    return 'tsx';
  }
  if (lower.endsWith('.mts')) {
    return 'mts';
  }
  if (lower.endsWith('.cts')) {
    return 'cts';
  }
  if (lower.endsWith('.ts')) {
    return 'ts';
  }
  return 'text';
}

function resolveRelations(
  node: GraphRenderNode,
  snapshot: GraphRenderSnapshot,
): NodeRelationSummary {
  const byNodeId = new Map<string, GraphRenderNode>(
    snapshot.nodes.map((value) => [value.nodeId, value] as const),
  );
  const incoming: NodeRelationItem[] = [];
  const outgoing: NodeRelationItem[] = [];
  for (const edge of snapshot.edges) {
    if (edge.targetNodeId === node.nodeId) {
      const other = byNodeId.get(edge.sourceNodeId);
      if (other) {
        incoming.push(toRelationItem(edge, other));
      }
    }
    if (edge.sourceNodeId === node.nodeId) {
      const other = byNodeId.get(edge.targetNodeId);
      if (other) {
        outgoing.push(toRelationItem(edge, other));
      }
    }
  }
  const incomingOverflowCount = Math.max(incoming.length - RELATION_LIMIT, 0);
  const outgoingOverflowCount = Math.max(outgoing.length - RELATION_LIMIT, 0);
  return {
    incoming: incoming.slice(0, RELATION_LIMIT),
    outgoing: outgoing.slice(0, RELATION_LIMIT),
    incomingOverflowCount,
    outgoingOverflowCount,
  };
}

function toRelationItem(edge: GraphRenderEdge, other: GraphRenderNode): NodeRelationItem {
  return {
    edge,
    nodeId: other.nodeId,
    label: other.label,
    kind: other.kind,
    isDiffNode: other.isDiffNode,
  };
}

function resolveThreads(
  node: GraphRenderNode,
  sourceSnapshot: ReviewSourceSnapshot | null,
  agentThreads: Poc3AgentReviewThread[],
): NodeThreadSummary {
  if (!sourceSnapshot || node.kind === 'external' || !node.filePath) {
    return {
      remote: [],
      local: [],
      agent: agentThreads.map((thread) => toAgentThreadSummary(thread)),
    };
  }
  const filtered = sourceSnapshot.remoteThreads
    .filter((t) => isNodeDetailRemoteThread(t) && t.location.kind === 'diff')
    .filter((t) => matchesRemoteThread(t, node))
    .map(toNodeRemoteThreadSummary);
  return {
    remote: filtered,
    local: [],
    agent: agentThreads.map((thread) => toAgentThreadSummary(thread)),
  };
}

function isNodeDetailRemoteThread(thread: ReviewRemoteThread): boolean {
  return thread.anchorStatus === 'current' || thread.anchorStatus === 'outdated';
}

function resolveOutdatedAgentThreadsForNode(
  node: GraphRenderNode,
  outdatedThreads: Poc3OutdatedAgentThread[],
  currentThreads: Poc3AgentReviewThread[],
): Poc3OutdatedAgentThread[] {
  const currentLocalThreadIds = new Set(currentThreads.map((thread) => thread.localThreadId));
  return outdatedThreads
    .filter((item) => !currentLocalThreadIds.has(item.thread.localThreadId))
    .filter((item) => matchesAgentThread(item.thread, node));
}

function matchesAgentThread(thread: Poc3AgentReviewThread, node: GraphRenderNode): boolean {
  const location = thread.location;
  if (location.kind === 'overview') {
    return node.kind === 'module' || node.kind === 'file-scope';
  }
  const filePath = location.filePath;
  if (!filePath || !node.filePath || filePath !== node.filePath) {
    return false;
  }
  if (node.kind === 'module' || node.kind === 'file-scope') {
    return true;
  }
  const range = node.declarationRange;
  if (!range) {
    return true;
  }
  const line = location.endLine ?? location.startLine;
  return line !== null && line >= range.startLine && line <= range.endLine;
}

function toNodeFindingSummary(
  thread: Poc3AgentReviewThread,
  options: {
    isOutdated: boolean;
    hasReplyableSession: boolean;
    publishedRemoteThreads: NodePublishedRemoteThreadSummary[];
  },
): NodeDetailSnapshot['findings'][number] {
  return {
    findingId: thread.findingId,
    localThreadId: thread.localThreadId,
    severity: thread.severity,
    category: thread.category,
    confidence: thread.confidence,
    title: thread.title,
    body: thread.draftBody,
    suggestion: thread.suggestion,
    line: thread.location.kind === 'diff' ? thread.location.startLine : null,
    endLine: thread.location.kind === 'diff' ? thread.location.endLine : null,
    side: thread.location.kind === 'diff' ? thread.location.side : null,
    status: thread.status === 'resolved' ? 'resolved' : 'open',
    hasReplyableSession: options.hasReplyableSession,
    isOutdated: options.isOutdated,
    publishedRemoteThreads: options.publishedRemoteThreads,
  };
}

function toNodePublishedRemoteThreadSummary(
  summary: PublishedRemoteThreadSummary,
): NodePublishedRemoteThreadSummary {
  return {
    linkId: summary.link.linkId,
    providerThreadId: summary.link.providerThreadId,
    providerCommentIds: summary.link.providerCommentIds,
    publishedAt: summary.link.publishedAt,
    lastSyncedAt: summary.link.lastSyncedAt,
    status: summary.link.status,
    remoteThread: summary.remoteThread ? toNodeRemoteThreadSummary(summary.remoteThread) : null,
  };
}

function toNodeRemoteThreadSummary(thread: ReviewRemoteThread): NodeRemoteThreadSummary {
  return {
    providerThreadId: thread.providerThreadId,
    location: thread.location,
    anchorStatus: thread.anchorStatus,
    isResolved: thread.isResolved,
    isOutdated: thread.isOutdated || thread.anchorStatus === 'outdated',
    comments: thread.comments,
  };
}

function toAgentThreadSummary(thread: Poc3AgentReviewThread): NodeThreadSummary['agent'][number] {
  return {
    threadId: thread.localThreadId,
    summary: thread.title,
    status: thread.status === 'resolved' ? 'resolved' : 'open',
    line: thread.location.kind === 'diff' ? thread.location.startLine : null,
  };
}

function matchesRemoteThread(thread: ReviewRemoteThread, node: GraphRenderNode): boolean {
  if (thread.location.kind !== 'diff') {
    return false;
  }
  if (thread.location.filePath !== node.filePath) {
    return false;
  }
  if (node.kind === 'module') {
    return true;
  }
  if (node.kind === 'file-scope') {
    return true;
  }
  const range = node.declarationRange;
  if (!range) {
    return true;
  }
  const line = thread.location.endLine ?? thread.location.startLine;
  if (line === null) {
    return false;
  }
  return line >= range.startLine && line <= range.endLine;
}

function toRenderSnapshot(record: WorkspaceGraphRecord): GraphRenderSnapshot {
  if (!record.graph) {
    return {
      revisionId: record.activeRevision?.revisionId ?? '',
      graphSnapshotId: '',
      scopeKey: '',
      status: 'failed',
      nodes: [],
      edges: [],
      viewport: null,
      limits: {
        nodeLimit: 0,
        edgeLimit: 0,
        omittedNodeCount: 0,
        omittedEdgeCount: 0,
        reason: 'none',
      },
      diagnostics: [],
    };
  }
  const graph = record.graph;
  const layout = record.layout;
  const positions: Record<string, GraphNodeLayout> = layout?.positions ?? fallbackGridLayout(graph);
  const diagnostics: GraphDiagnostic[] = [...graph.diagnostics];
  return {
    revisionId: graph.revisionId,
    graphSnapshotId: graph.graphSnapshotId,
    scopeKey: graph.scopeKey,
    status: graph.status,
    nodes: graph.nodes.map((current) => {
      const position = positions[current.nodeId] ?? {
        x: 0,
        y: 0,
        width: 260,
        height: 60,
      };
      return {
        ...current,
        position: { x: position.x, y: position.y },
        size: { width: position.width, height: position.height },
        extent: null,
      };
    }),
    edges: graph.edges.map((edge) => ({
      ...edge,
      label: edge.kind === 'imports' || edge.kind === 'exports' ? edge.kind : null,
    })),
    viewport: layout?.viewport ?? null,
    limits: graph.limits,
    diagnostics,
  };
}
