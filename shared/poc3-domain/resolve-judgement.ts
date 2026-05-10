import type { AgentKind } from '../domain/agent';

export type ResolveJudgementCommentType = 'agent-thread' | 'remote-thread';

export interface ResolveJudgementCommentKey {
  reviewWorkspaceId: string;
  revisionId: string;
  commentType: ResolveJudgementCommentType;
  commentId: string;
}

export type ResolveJudgementDecision = 'resolvable' | 'unresolvable';

export type ResolveJudgementRunStatus = 'starting' | 'running' | 'completed' | 'failed';

export interface ResolveJudgementRun {
  runId: string;
  reviewWorkspaceId: string;
  revisionId: string;
  scopeKey: string;
  agent: AgentKind;
  status: ResolveJudgementRunStatus;
  targetCount: number;
  rootAppSessionId: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface ResolveJudgementResult {
  key: ResolveJudgementCommentKey;
  runId: string;
  decision: ResolveJudgementDecision;
  reasonMarkdown: string;
  evidence: string[];
  checkedAt: string;
}

export type ResolveJudgementLocation =
  | {
      kind: 'diff';
      filePath: string;
      startLine: number | null;
      endLine: number | null;
      side: 'old' | 'new' | 'LEFT' | 'RIGHT';
    }
  | {
      kind: 'node';
      nodeId: string;
      filePath: string | null;
      startLine: number | null;
      endLine: number | null;
    }
  | { kind: 'overview' };

export interface ResolveJudgementReply {
  role: 'reviewer' | 'author' | 'agent' | 'user' | 'unknown';
  body: string;
  createdAt: string | null;
}

export interface ResolveJudgementCodeContext {
  diffPatch: string | null;
  currentExcerpt: string | null;
  relatedFiles: Array<{
    filePath: string;
    excerpt: string;
  }>;
}

export interface ResolveJudgementTarget {
  key: ResolveJudgementCommentKey;
  nodeId: string | null;
  title: string;
  primaryBody: string;
  replies: ResolveJudgementReply[];
  location: ResolveJudgementLocation;
  currentCodeContext: ResolveJudgementCodeContext;
  sourceState: {
    isOutdated: boolean | null;
    isResolved: boolean | null;
    status: 'open' | 'dismissed' | 'resolved' | 'unknown';
  };
  linkedRemoteThreads?: Array<{
    providerThreadId: string;
    isResolved: boolean | null;
    isOutdated: boolean | null;
    comments: ResolveJudgementReply[];
  }>;
}

export interface ResolveJudgementAgentOutputItem {
  commentType: ResolveJudgementCommentType;
  commentId: string;
  decision: ResolveJudgementDecision;
  reasonMarkdown: string;
  evidence: string[];
}

export interface ResolveJudgementAgentOutput {
  results: ResolveJudgementAgentOutputItem[];
}

export type ResolveJudgementEvent =
  | { type: 'resolve-judgement.started'; run: ResolveJudgementRun }
  | {
      type: 'resolve-judgement.completed';
      run: ResolveJudgementRun;
      results: ResolveJudgementResult[];
    }
  | { type: 'resolve-judgement.failed'; run: ResolveJudgementRun; message: string };

export function toResolveJudgementMapKey(key: ResolveJudgementCommentKey): string {
  return `${key.reviewWorkspaceId}:${key.revisionId}:${key.commentType}:${key.commentId}`;
}
