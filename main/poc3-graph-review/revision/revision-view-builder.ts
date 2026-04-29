import type { WorkspaceRevisionView } from '../../../shared/poc3-domain/revision-commit';
import type { GraphReviewStore } from '../store/graph-review-store';
import type { Poc3AgentReviewStore } from '../agent/store';

export class RevisionViewBuilder {
  constructor(
    private readonly graphStore: GraphReviewStore,
    private readonly agentReviewStore: Poc3AgentReviewStore,
  ) {}

  build(reviewWorkspaceId: string): WorkspaceRevisionView | null {
    const workspace = this.graphStore.getWorkspace(reviewWorkspaceId);
    if (!workspace) {
      return null;
    }
    const activeRevision = this.graphStore.getActiveRevision(reviewWorkspaceId);
    const outdated = this.agentReviewStore.countOutdatedThreadTracking(
      reviewWorkspaceId,
      activeRevision?.revisionId ?? null,
    );
    return {
      reviewWorkspaceId,
      activeRevisionId: activeRevision?.revisionId ?? null,
      activeHeadSha: activeRevision?.headSha ?? null,
      commits: this.graphStore.getRevisionCommitView(reviewWorkspaceId),
      revisions: this.graphStore.listRevisions(reviewWorkspaceId),
      latestRefresh: this.graphStore.getLatestRevisionRefreshRun(reviewWorkspaceId),
      outdatedThreadSummary: {
        count: outdated.count,
        latestCheckedRevisionId: outdated.latestCheckedRevisionId,
      },
    };
  }
}
