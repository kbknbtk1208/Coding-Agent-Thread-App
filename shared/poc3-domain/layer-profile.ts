import type { GraphNodeLayout, SourceRange } from './graph';

export type RepositoryLayerLayoutDirection = 'RIGHT';
export type RepositoryLayerDependencyDirection = 'order-ascending';
export type RepositoryLayerLayoutStrategy = 'lane-composition' | 'elk-compound';

export interface RepositoryLayerProfile {
  layerProfileId: string;
  repositoryProfileId: string;
  repositoryIdentityKey: string;
  schemaVersion: number;
  profileVersion: number;
  displayName: string;
  layoutDirection: RepositoryLayerLayoutDirection;
  dependencyDirection: RepositoryLayerDependencyDirection;
  layoutStrategy: RepositoryLayerLayoutStrategy;
  rules: RepositoryLayerRule[];
  ignoredPatterns: RepositoryLayerIgnorePattern[];
  createdAt: string;
  updatedAt: string;
  lastAppliedAt: string | null;
}

export interface RepositoryLayerProfileDraft {
  layerProfileId?: string | null;
  repositoryProfileId: string;
  repositoryIdentityKey?: string | null;
  schemaVersion?: number;
  profileVersion?: number;
  displayName: string;
  layoutDirection: RepositoryLayerLayoutDirection;
  dependencyDirection: RepositoryLayerDependencyDirection;
  layoutStrategy: RepositoryLayerLayoutStrategy;
  rules: RepositoryLayerRuleDraft[];
  ignoredPatterns: RepositoryLayerIgnorePatternDraft[];
}

export interface RepositoryLayerRule {
  layerRuleId: string;
  glob: string;
  layerPath: string;
  displayName: string;
  description: string | null;
  order: number;
  priority: number;
  enabled: boolean;
}

export type RepositoryLayerRuleDraft = Partial<Pick<RepositoryLayerRule, 'layerRuleId'>> &
  Omit<RepositoryLayerRule, 'layerRuleId'>;

export interface RepositoryLayerIgnorePattern {
  ignorePatternId: string;
  glob: string;
  reason: string | null;
  enabled: boolean;
}

export type RepositoryLayerIgnorePatternDraft = Partial<
  Pick<RepositoryLayerIgnorePattern, 'ignorePatternId'>
> &
  Omit<RepositoryLayerIgnorePattern, 'ignorePatternId'>;

export type LayerClassificationStatus =
  | 'classified'
  | 'unclassified'
  | 'ignored'
  | 'external'
  | 'outOfScope';

export interface GraphNodeLayerClassification {
  nodeId: string;
  filePath: string | null;
  normalizedFilePath: string | null;
  status: LayerClassificationStatus;
  layerPath: string | null;
  layerRuleId: string | null;
  matchedLayerRuleIds: string[];
  conflictingLayerRuleIds: string[];
  ignoredPatternId: string | null;
}

export type GraphEdgeLayerDirection =
  | 'expected'
  | 'reverse'
  | 'same-layer'
  | 'unclassified'
  | 'external';

export interface GraphEdgeLayerClassification {
  edgeId: string;
  sourceLayerPath: string | null;
  targetLayerPath: string | null;
  direction: GraphEdgeLayerDirection;
  isArchitectureViolation: boolean;
}

export interface GraphLayerRenderSnapshot {
  layerProfileId: string;
  profileVersion: number;
  appliedAt: string;
  status: 'ready' | 'pending' | 'stale' | 'failed';
  enabled: boolean;
  lanes: GraphLayerLaneRender[];
  groups: GraphLayerGroupRender[];
  unclassifiedSummary: GraphLayerUnclassifiedSummary;
  ignoredSummary: GraphLayerIgnoredSummary;
  violationEdgeIds: string[];
  diagnostics: GraphLayerDiagnostic[];
}

export interface GraphLayerLaneRender {
  laneId: string;
  layerPath: string;
  displayName: string;
  order: number;
  parentLayerPath: string | null;
  bounds: GraphLayerBounds;
  nodeIds: string[];
  unclassified: boolean;
}

export interface GraphLayerGroupRender {
  groupId: string;
  layerPath: string;
  displayName: string;
  bounds: GraphLayerBounds;
  childLaneIds: string[];
}

export interface GraphLayerBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphLayerUnclassifiedSummary {
  nodeCount: number;
  fileCount: number;
  directories: GraphLayerUnclassifiedDirectory[];
}

export interface GraphLayerUnclassifiedDirectory {
  directoryPath: string;
  nodeCount: number;
  fileCount: number;
  suggestedGlob: string;
  exampleFilePaths: string[];
}

export interface GraphLayerIgnoredSummary {
  nodeCount: number;
  fileCount: number;
}

export type GraphLayerDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface GraphLayerDiagnostic {
  code: string;
  severity: GraphLayerDiagnosticSeverity;
  message: string;
  nodeId?: string;
  edgeId?: string;
  filePath?: string;
  layerRuleIds?: string[];
}

export interface GraphLayerApplicationSnapshot {
  graphLayerApplicationId: string;
  graphSnapshotId: string;
  layerProfileId: string;
  profileVersion: number;
  positions: Record<string, GraphNodeLayout>;
  lanes: GraphLayerLaneRender[];
  groups: GraphLayerGroupRender[];
  nodeClassifications: Record<string, GraphNodeLayerClassification>;
  edgeClassifications: Record<string, GraphEdgeLayerClassification>;
  diagnostics: GraphLayerDiagnostic[];
  appliedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEdgeCandidate {
  apiEdgeCandidateId: string;
  revisionId: string;
  sourceFilePath: string;
  targetFilePath: string | null;
  endpointId: string | null;
  routePattern: string | null;
  method: string | null;
  confidence: 'high' | 'medium' | 'low';
  detectionSource: 'shared-schema' | 'url-literal' | 'runtime';
  evidenceRanges: SourceRange[];
  suppressed: boolean;
  suppressedReason: string | null;
}

export interface ApiEndpointNode {
  endpointId: string;
  layerPath: string | null;
  label: string;
  routePattern: string;
  method: string | null;
  filePath: string | null;
}
