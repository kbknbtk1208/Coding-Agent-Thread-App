import type { AgentKind, AppSession } from '../../../../shared/domain/agent';
import type { GraphRenderSnapshot } from '../../../../shared/poc3-domain/graph';
import type { Poc3AgentReviewRun } from '../../../../shared/poc3-domain/agent-review';
import type { ReviewWorkspaceListItem } from '../workspaces/use-review-workspaces';

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
  target: AgentReviewTarget;
}

export interface AgentReviewPromptContext {
  workspace: ReviewWorkspaceListItem;
  graph: Pick<GraphRenderSnapshot, 'graphSnapshotId' | 'scopeKey' | 'status' | 'nodes' | 'edges'>;
}
