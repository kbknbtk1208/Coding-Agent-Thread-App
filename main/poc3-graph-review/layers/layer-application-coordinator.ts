import type {
  PreviewRepositoryLayerProfileResult,
  RecomputeWorkspaceLayerLayoutResult,
} from '../../../shared/poc3-contracts/graph-review-ipc';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type {
  GraphLayerApplicationSnapshot,
  GraphLayerDiagnostic,
  RepositoryLayerProfile,
} from '../../../shared/poc3-domain/layer-profile';
import { INITIAL_GRAPH_SCOPE_KEY } from '../../../shared/poc3-domain/graph';
import type { LayerApplicationEvent } from '../../../shared/poc3-contracts/graph-review-ipc';
import type { GraphReviewStore } from '../store/graph-review-store';
import { LayerClassificationService } from './layer-classification-service';
import type { LayerProfileStore } from './layer-profile-store';
import { createGraphLayerApplicationId, LayeredLayoutService } from './layered-layout-service';

export interface LayerApplicationCoordinatorDependencies {
  graphStore: GraphReviewStore;
  layerProfileStore: LayerProfileStore;
  emit: (event: LayerApplicationEvent) => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class LayerApplicationCoordinator {
  private readonly graphStore: GraphReviewStore;
  private readonly layerProfileStore: LayerProfileStore;
  private readonly emit: (event: LayerApplicationEvent) => void;
  private readonly classificationService = new LayerClassificationService();
  private readonly layoutService = new LayeredLayoutService();

  constructor(dependencies: LayerApplicationCoordinatorDependencies) {
    this.graphStore = dependencies.graphStore;
    this.layerProfileStore = dependencies.layerProfileStore;
    this.emit = dependencies.emit;
  }

  preview(input: {
    reviewWorkspaceId: string;
    scopeKey?: string;
    profile: RepositoryLayerProfile;
  }): PreviewRepositoryLayerProfileResult {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        diagnostics: [],
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        diagnostics: [],
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        diagnostics: [],
      };
    }

    const classification = this.classificationService.classify({
      graph: record.graph,
      profile: input.profile,
      worktreeRootPath: record.workspace.worktreePath,
    });
    return {
      ok: true,
      summary: classification.unclassifiedSummary,
      diagnostics: classification.diagnostics,
      violationEdgeIds: classification.violationEdgeIds,
    };
  }

  async recompute(input: {
    reviewWorkspaceId: string;
    scopeKey?: string;
  }): Promise<RecomputeWorkspaceLayerLayoutResult> {
    const reviewWorkspaceId = input.reviewWorkspaceId.trim();
    const scopeKey = input.scopeKey ?? INITIAL_GRAPH_SCOPE_KEY;
    const record = this.graphStore.getWorkspaceGraphRecord(reviewWorkspaceId, scopeKey);
    if (!record) {
      return {
        ok: false,
        reason: 'workspaceNotFound',
        message: 'Review Workspace が見つかりません。',
        diagnostics: [],
      };
    }
    if (!record.activeRevision) {
      return {
        ok: false,
        reason: 'revisionNotFound',
        message: 'Active revision が見つかりません。',
        diagnostics: [],
      };
    }
    if (!record.graph) {
      return {
        ok: false,
        reason: 'graphNotReady',
        message: 'Graph snapshot がまだ保存されていません。',
        diagnostics: [],
      };
    }

    const profileRead = this.layerProfileStore.readByRepositoryProfileId(
      record.workspace.repositoryProfileId,
    );
    if (!profileRead.profile) {
      return {
        ok: false,
        reason: 'layerProfileNotFound',
        message: 'Layer profile が設定されていません。',
        diagnostics: profileRead.diagnostics,
      };
    }

    this.emit({
      type: 'layer.application.started',
      reviewWorkspaceId,
      graphSnapshotId: record.graph.graphSnapshotId,
      layerProfileId: profileRead.profile.layerProfileId,
      profileVersion: profileRead.profile.profileVersion,
    });

    try {
      const application = await this.applyToGraph({
        graph: record.graph,
        worktreeRootPath: record.workspace.worktreePath,
        profile: profileRead.profile,
      });
      this.graphStore.saveGraphLayerApplication(application);
      this.layerProfileStore.markApplied({
        layerProfileId: profileRead.profile.layerProfileId,
        appliedAt: application.appliedAt,
      });
      this.emit({
        type: 'layer.application.completed',
        reviewWorkspaceId,
        graphSnapshotId: record.graph.graphSnapshotId,
        graphLayerApplicationId: application.graphLayerApplicationId,
        layerProfileId: application.layerProfileId,
        profileVersion: application.profileVersion,
      });
      return { ok: true, application };
    } catch (err) {
      const diagnostics: GraphLayerDiagnostic[] = [
        {
          code: 'LAYER_LAYOUT_FAILED_FALLBACK_GRID',
          severity: 'error',
          message: err instanceof Error ? err.message : 'Layer layout failed.',
        },
      ];
      this.emit({
        type: 'layer.application.failed',
        reviewWorkspaceId,
        graphSnapshotId: record.graph.graphSnapshotId,
        layerProfileId: profileRead.profile.layerProfileId,
        profileVersion: profileRead.profile.profileVersion,
        message: diagnostics[0].message,
        diagnostics,
      });
      return {
        ok: false,
        reason: 'layoutFailed',
        message: diagnostics[0].message,
        diagnostics,
      };
    }
  }

  private async applyToGraph(input: {
    graph: CodeGraphSnapshot;
    profile: RepositoryLayerProfile;
    worktreeRootPath: string;
  }): Promise<GraphLayerApplicationSnapshot> {
    const classification = this.classificationService.classify({
      graph: input.graph,
      profile: input.profile,
      worktreeRootPath: input.worktreeRootPath,
    });
    const layout = await this.layoutService.layout({
      graph: input.graph,
      profile: input.profile,
      nodeClassifications: classification.nodeClassifications,
    });
    const timestamp = nowIso();
    return {
      graphLayerApplicationId: createGraphLayerApplicationId(),
      graphSnapshotId: input.graph.graphSnapshotId,
      layerProfileId: input.profile.layerProfileId,
      profileVersion: input.profile.profileVersion,
      positions: layout.positions,
      lanes: layout.lanes,
      groups: layout.groups,
      nodeClassifications: classification.nodeClassifications,
      edgeClassifications: classification.edgeClassifications,
      diagnostics: [...classification.diagnostics, ...layout.diagnostics],
      appliedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
