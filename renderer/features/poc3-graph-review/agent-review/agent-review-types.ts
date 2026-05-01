import type { AgentKind, AppSession } from '../../../../shared/domain/agent';
import type { CodexModelOption } from '../../../../shared/domain/agent';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewRun } from '../../../../shared/poc3-domain/agent-review';
import type {
  AgentReviewRunCommitSnapshot,
  AgentReviewRunDetail,
} from '../../../../shared/poc3-contracts/graph-review-ipc';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

export type { AgentReviewRunCommitSnapshot, AgentReviewRunDetail };

export type AgentReviewRunStatus =
  | 'starting'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'fallback_rich_text'
  | 'failed';

export interface AgentReviewRun {
  runId: string;
  agent: AgentKind;
  instructions: string;
  status: AgentReviewRunStatus;
  appSessionId: string | null;
  session: AppSession | null;
  errorMessage: string | null;
  codexModel: string | null;
  codexReasoningEffort: string | null;
  commit: AgentReviewRunCommitSnapshot | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  serverRun?: Poc3AgentReviewRun;
}

export interface AgentReviewTarget {
  workspace: ReviewWorkspaceListItem;
  graph: GraphRenderSnapshot;
}

export interface AgentReviewStartInput {
  agent: AgentKind;
  instructions: string;
  codexModel?: string;
  codexReasoningEffort?: string;
  target: AgentReviewTarget;
}

export interface AgentReviewCodexModelState {
  models: CodexModelOption[];
  selectedModel: string;
  selectedReasoningEffort: string;
  isLoading: boolean;
  errorMessage: string | null;
}

export interface AgentReviewPromptContext {
  workspace: ReviewWorkspaceListItem;
  graph: Pick<GraphRenderSnapshot, 'graphSnapshotId' | 'scopeKey' | 'status' | 'nodes' | 'edges'>;
}

export type AgentReviewDockView =
  | { kind: 'history' }
  | { kind: 'new-review' }
  | { kind: 'run-detail'; runId: string };

export type SlideDirection = 'forward' | 'back';
