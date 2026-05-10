import fs from 'fs';
import path from 'path';
import type { GraphRenderSnapshot } from '../../../shared/poc3-domain/graph';
import type {
  NodeCodeExcerptLanguage,
  NodeCompanionDetailSnapshot,
  NodeDetailDiagnostic,
  NodeDiffExcerpt,
  NodeDiffSummary,
  NodeFileContext,
  NodePublishedRemoteThreadSummary,
  NodeRemoteThreadSummary,
  NodeThreadSummary,
  TestCaseTreeNode,
} from '../../../shared/poc3-domain/node-detail';
import { extractTestCases, isAstSupportedLanguage } from '../analysis/test-case-extractor';
import type { Poc3AgentReviewThread } from '../../../shared/poc3-domain/agent-review';
import type {
  PublishedAgentThreadLink,
  PublishedRemoteThreadSummary,
} from '../../../shared/poc3-domain/published-agent-thread';
import type {
  ReviewChangedFile,
  ReviewRemoteThread,
  ReviewSourceSnapshot,
} from '../../../shared/poc3-domain/source-snapshot';
import type { ReviewWorkspace } from '../../../shared/poc3-domain/review-workspace';
import type { WorkspaceGraphRecord } from '../store/graph-review-store';
import { buildPublishedThreadVisibility } from '../published-agent-thread/visibility';

export interface ResolveNodeCompanionDetailContext {
  workspace: ReviewWorkspace;
  revisionId: string;
  scopeKey: string;
  ownerNodeId: string;
  relationId: string;
  record: WorkspaceGraphRecord;
  renderSnapshot: GraphRenderSnapshot;
  sourceSnapshot: ReviewSourceSnapshot | null;
  agentThreads: Poc3AgentReviewThread[];
  publishedAgentThreadLinks?: PublishedAgentThreadLink[];
}

export type ResolveNodeCompanionDetailResult =
  | { ok: true; detail: NodeCompanionDetailSnapshot }
  | {
      ok: false;
      reason: 'ownerNodeNotFound' | 'companionNotFound' | 'fileNotFound' | 'detailUnavailable';
      message: string;
      detail: NodeCompanionDetailSnapshot | null;
    };

const FILE_CONTEXT_LINE_LIMIT = 800;

export function resolveNodeCompanionDetail(
  context: ResolveNodeCompanionDetailContext,
): ResolveNodeCompanionDetailResult {
  const { record, ownerNodeId, relationId, workspace, sourceSnapshot } = context;
  const ownerNode = context.renderSnapshot.nodes.find((node) => node.nodeId === ownerNodeId);
  if (!ownerNode) {
    return {
      ok: false,
      reason: 'ownerNodeNotFound',
      message: '指定された owner node が見つかりません。',
      detail: null,
    };
  }
  const companion = (record.graph?.companionFiles ?? []).find(
    (item) =>
      item.relationId === relationId &&
      (item.ownerNodeId === ownerNodeId || item.ownerFilePath === ownerNode.filePath),
  );
  if (!companion) {
    return {
      ok: false,
      reason: 'companionNotFound',
      message: '対応ファイルが見つかりません。',
      detail: null,
    };
  }

  const filePath = companion.companionFilePath;
  const diagnostics: NodeDetailDiagnostic[] = [];
  const changedFile = sourceSnapshot?.changedFiles.find((file) => file.path === filePath) ?? null;
  const visibility = buildPublishedThreadVisibility({
    reviewWorkspaceId: workspace.reviewWorkspaceId,
    agentThreads: context.agentThreads,
    remoteThreads: sourceSnapshot?.remoteThreads ?? [],
    links: context.publishedAgentThreadLinks ?? [],
  });
  const visibleSourceSnapshot = sourceSnapshot
    ? { ...sourceSnapshot, remoteThreads: visibility.visibleRemoteThreads }
    : null;
  const source = resolveFileSource(workspace, filePath, diagnostics);
  if (!source && !changedFile) {
    return {
      ok: false,
      reason: 'fileNotFound',
      message: '対応ファイルを worktree または diff から読み込めませんでした。',
      detail: null,
    };
  }

  let testCases: TestCaseTreeNode[] | null = null;
  if (companion.companionRole === 'test' && source) {
    if (isAstSupportedLanguage(source.language)) {
      const result = extractTestCases({
        content: source.content,
        language: source.language,
        baseLine: source.startLine,
      });
      testCases = result.testCases;
      for (const d of result.diagnostics) {
        diagnostics.push({
          code: d.code,
          message: `${filePath}: ${d.message}`,
          severity: 'warning',
        });
      }
    }
  }

  const detail: NodeCompanionDetailSnapshot = {
    reviewWorkspaceId: workspace.reviewWorkspaceId,
    revisionId: context.revisionId,
    scopeKey: context.scopeKey,
    ownerNodeId,
    relationId,
    role: companion.companionRole,
    filePath,
    displayMode: companion.displayMode,
    summary: { filePath },
    source,
    diffSummary: resolveDiffSummary(changedFile),
    diffExcerpt: resolveDiffExcerpt(changedFile),
    threads: resolveThreads(filePath, visibleSourceSnapshot, context.agentThreads),
    findings: context.agentThreads
      .filter((thread) => thread.location.kind === 'diff' && thread.location.filePath === filePath)
      .map((thread) => ({
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
        status: thread.status === 'dismissed' ? 'resolved' : 'open',
        hasReplyableSession: true,
        publishedRemoteThreads: (
          visibility.publishedRemoteByLocalThreadId.get(thread.localThreadId) ?? []
        ).map(toNodePublishedRemoteThreadSummary),
      })),
    diagnostics,
    testCases,
  };

  return { ok: true, detail };
}

function resolveFileSource(
  workspace: ReviewWorkspace,
  filePath: string,
  diagnostics: NodeDetailDiagnostic[],
): NodeFileContext | null {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(workspace.worktreePath, filePath);
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    diagnostics.push({
      code: 'COMPANION_FILE_UNAVAILABLE',
      message: `worktree から対応ファイルを読み込めませんでした: ${filePath}`,
      severity: 'warning',
    });
    return null;
  }
  const lines = content.split(/\r?\n/);
  const endLine = Math.min(lines.length, FILE_CONTEXT_LINE_LIMIT);
  return {
    filePath,
    language: detectLanguage(filePath),
    mode: 'file',
    startLine: 1,
    endLine,
    highlightedLineNumbers: [],
    content: lines.slice(0, endLine).join('\n'),
  };
}

function resolveDiffExcerpt(changedFile: ReviewChangedFile | null): NodeDiffExcerpt | null {
  if (!changedFile || (!changedFile.patch && changedFile.hunks.length === 0)) return null;
  return {
    filePath: changedFile.path,
    patch: changedFile.patch ?? '',
    hunkHeaders: changedFile.hunks
      .map((hunk) => hunk.header)
      .filter((header): header is string => typeof header === 'string' && header.length > 0),
    changedLineNumbers: Array.from(
      new Set(changedFile.hunks.flatMap((hunk) => hunk.changedNewLines)),
    ).sort((a, b) => a - b),
  };
}

function resolveDiffSummary(changedFile: ReviewChangedFile | null): NodeDiffSummary {
  if (!changedFile) return { hasDiff: false, changedLineNumbers: [], hunks: [], patch: null };
  const changedLineNumbers = Array.from(
    new Set(changedFile.hunks.flatMap((hunk) => hunk.changedNewLines)),
  ).sort((a, b) => a - b);
  return {
    hasDiff: changedLineNumbers.length > 0 || Boolean(changedFile.patch),
    changedLineNumbers,
    hunks: changedFile.hunks.map((hunk) => ({
      header:
        hunk.header ??
        `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.newStart,
      newLines: hunk.newLines,
      changedNewLines: hunk.changedNewLines,
      changedOldLines: hunk.changedOldLines,
    })),
    patch: changedFile.patch ?? null,
  };
}

function resolveThreads(
  filePath: string,
  sourceSnapshot: ReviewSourceSnapshot | null,
  agentThreads: Poc3AgentReviewThread[],
): NodeThreadSummary {
  const remote: NodeRemoteThreadSummary[] =
    sourceSnapshot?.remoteThreads
      .filter((thread) => isCurrentDiffThreadForFile(thread, filePath))
      .map(toNodeRemoteThreadSummary) ?? [];
  return {
    remote,
    local: [],
    agent: agentThreads
      .filter((thread) => thread.location.kind === 'diff' && thread.location.filePath === filePath)
      .map((thread) => ({
        threadId: thread.localThreadId,
        summary: thread.title,
        status: thread.status === 'dismissed' ? 'resolved' : 'open',
        line: thread.location.kind === 'diff' ? thread.location.startLine : null,
      })),
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

function isCurrentDiffThreadForFile(thread: ReviewRemoteThread, filePath: string): boolean {
  return (
    (thread.anchorStatus === 'current' || thread.anchorStatus === 'outdated') &&
    thread.location.kind === 'diff' &&
    thread.location.filePath === filePath
  );
}

function detectLanguage(filePath: string): NodeCodeExcerptLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx')) return 'tsx';
  if (lower.endsWith('.mts')) return 'mts';
  if (lower.endsWith('.cts')) return 'cts';
  if (lower.endsWith('.ts')) return 'ts';
  return 'text';
}
