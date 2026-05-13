import type {
  CodeCompanionFile,
  CodeGraphEdge,
  CodeGraphSnapshot,
} from '../../../shared/poc3-domain/graph';
import type {
  GraphEdgeLayerClassification,
  GraphLayerDiagnostic,
  GraphLayerIgnoredSummary,
  GraphNodeLayerClassification,
  RepositoryLayerProfile,
} from '../../../shared/poc3-domain/layer-profile';
import { isUnitOrIntegrationTestFile } from '../analysis/test-file-classifier';
import { LayerRuleResolver } from './layer-rule-resolver';
import { buildUnclassifiedDirectorySuggestions } from './unclassified-directory-suggester';

export interface LayerClassificationServiceInput {
  graph: CodeGraphSnapshot;
  profile: RepositoryLayerProfile;
  worktreeRootPath?: string | null;
}

export interface LayerClassificationServiceResult {
  nodeClassifications: Record<string, GraphNodeLayerClassification>;
  edgeClassifications: Record<string, GraphEdgeLayerClassification>;
  unclassifiedSummary: ReturnType<typeof buildUnclassifiedDirectorySuggestions>;
  ignoredSummary: GraphLayerIgnoredSummary;
  violationEdgeIds: string[];
  diagnostics: GraphLayerDiagnostic[];
}

const BUILT_IN_NON_PRODUCT_PATH_PATTERN =
  /(^|\/)(fixtures?|__fixtures__|snapshots?|__snapshots__|generated|dist|build|out|coverage)(\/|$)/i;

function isExternalNodeKind(kind: string): boolean {
  return kind === 'external' || kind === 'external-symbol';
}

function buildCompanionTestNodeIds(companionFiles: CodeCompanionFile[] | undefined): Set<string> {
  const testNodeIds = new Set<string>();
  for (const companion of companionFiles ?? []) {
    if (companion.ownerRole === 'test') {
      testNodeIds.add(companion.ownerNodeId);
    }
    if (companion.companionRole === 'test') {
      for (const nodeId of companion.companionNodeIds) {
        testNodeIds.add(nodeId);
      }
      for (const nodeId of companion.hiddenNodeIds) {
        testNodeIds.add(nodeId);
      }
    }
  }
  return testNodeIds;
}

function isBuiltInOutOfScope(input: {
  nodeId: string;
  normalizedFilePath: string;
  companionTestNodeIds: Set<string>;
}): boolean {
  return (
    input.companionTestNodeIds.has(input.nodeId) ||
    isUnitOrIntegrationTestFile(input.normalizedFilePath) ||
    BUILT_IN_NON_PRODUCT_PATH_PATTERN.test(input.normalizedFilePath)
  );
}

function layerOrderByPath(profile: RepositoryLayerProfile): Map<string, number> {
  const result = new Map<string, number>();
  for (const rule of profile.rules) {
    if (!rule.enabled) {
      continue;
    }
    const current = result.get(rule.layerPath);
    if (current === undefined || rule.order < current) {
      result.set(rule.layerPath, rule.order);
    }
  }
  return result;
}

function edgeDirection(input: {
  edge: CodeGraphEdge;
  source: GraphNodeLayerClassification | undefined;
  target: GraphNodeLayerClassification | undefined;
  orderByLayerPath: Map<string, number>;
}): GraphEdgeLayerClassification {
  const sourceLayerPath = input.source?.layerPath ?? null;
  const targetLayerPath = input.target?.layerPath ?? null;
  if (input.source?.status === 'external' || input.target?.status === 'external') {
    return {
      edgeId: input.edge.edgeId,
      sourceLayerPath,
      targetLayerPath,
      direction: 'external',
      isArchitectureViolation: false,
    };
  }
  if (!sourceLayerPath || !targetLayerPath) {
    return {
      edgeId: input.edge.edgeId,
      sourceLayerPath,
      targetLayerPath,
      direction: 'unclassified',
      isArchitectureViolation: false,
    };
  }
  if (sourceLayerPath === targetLayerPath) {
    return {
      edgeId: input.edge.edgeId,
      sourceLayerPath,
      targetLayerPath,
      direction: 'same-layer',
      isArchitectureViolation: false,
    };
  }
  const sourceOrder = input.orderByLayerPath.get(sourceLayerPath);
  const targetOrder = input.orderByLayerPath.get(targetLayerPath);
  if (sourceOrder === undefined || targetOrder === undefined) {
    return {
      edgeId: input.edge.edgeId,
      sourceLayerPath,
      targetLayerPath,
      direction: 'unclassified',
      isArchitectureViolation: false,
    };
  }
  const isReverse = sourceOrder > targetOrder;
  return {
    edgeId: input.edge.edgeId,
    sourceLayerPath,
    targetLayerPath,
    direction: isReverse ? 'reverse' : 'expected',
    isArchitectureViolation: isReverse,
  };
}

export class LayerClassificationService {
  private readonly resolver: LayerRuleResolver;

  constructor(resolver = new LayerRuleResolver()) {
    this.resolver = resolver;
  }

  classify(input: LayerClassificationServiceInput): LayerClassificationServiceResult {
    const companionTestNodeIds = buildCompanionTestNodeIds(input.graph.companionFiles);
    const nodeClassifications: Record<string, GraphNodeLayerClassification> = {};
    const diagnostics: GraphLayerDiagnostic[] = [];
    const filePathCache = new Map<string, ReturnType<LayerRuleResolver['resolve']>>();

    for (const node of input.graph.nodes) {
      if (isExternalNodeKind(node.kind)) {
        nodeClassifications[node.nodeId] = {
          nodeId: node.nodeId,
          filePath: node.filePath,
          normalizedFilePath: null,
          status: 'external',
          layerPath: null,
          layerRuleId: null,
          matchedLayerRuleIds: [],
          conflictingLayerRuleIds: [],
          ignoredPatternId: null,
        };
        continue;
      }
      if (!node.filePath) {
        nodeClassifications[node.nodeId] = {
          nodeId: node.nodeId,
          filePath: null,
          normalizedFilePath: null,
          status: 'outOfScope',
          layerPath: null,
          layerRuleId: null,
          matchedLayerRuleIds: [],
          conflictingLayerRuleIds: [],
          ignoredPatternId: null,
        };
        continue;
      }

      const cacheKey = `${input.profile.layerProfileId}:${input.profile.profileVersion}:${node.filePath}`;
      let resolution = filePathCache.get(cacheKey);
      if (!resolution) {
        resolution = this.resolver.resolve(input.profile, node.filePath, {
          worktreeRootPath: input.worktreeRootPath,
        });
        filePathCache.set(cacheKey, resolution);
      }
      diagnostics.push(
        ...resolution.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          nodeId: diagnostic.nodeId ?? node.nodeId,
        })),
      );

      const common = {
        nodeId: node.nodeId,
        filePath: node.filePath,
        normalizedFilePath: resolution.filePath || null,
        layerPath: resolution.layerRule?.layerPath ?? null,
        layerRuleId: resolution.layerRule?.layerRuleId ?? null,
        matchedLayerRuleIds: resolution.matchedLayerRuleIds,
        conflictingLayerRuleIds: resolution.conflictingLayerRuleIds,
        ignoredPatternId: resolution.ignoredPattern?.ignorePatternId ?? null,
      };

      if (resolution.status === 'matched') {
        nodeClassifications[node.nodeId] = {
          ...common,
          status: 'classified',
        };
        continue;
      }
      if (resolution.status === 'ignored') {
        nodeClassifications[node.nodeId] = {
          ...common,
          status: 'ignored',
        };
        continue;
      }
      if (
        resolution.status === 'rejected' ||
        isBuiltInOutOfScope({
          nodeId: node.nodeId,
          normalizedFilePath: resolution.filePath,
          companionTestNodeIds,
        })
      ) {
        nodeClassifications[node.nodeId] = {
          ...common,
          status: 'outOfScope',
        };
        continue;
      }

      nodeClassifications[node.nodeId] = {
        ...common,
        status: 'unclassified',
      };
      diagnostics.push({
        code: 'LAYER_NODE_UNCLASSIFIED',
        severity: 'info',
        message: 'Node did not match any layer rule.',
        nodeId: node.nodeId,
        filePath: resolution.filePath,
      });
    }

    const orderByLayerPath = layerOrderByPath(input.profile);
    const edgeClassifications: Record<string, GraphEdgeLayerClassification> = {};
    const violationEdgeIds: string[] = [];
    for (const edge of input.graph.edges) {
      const classification = edgeDirection({
        edge,
        source: nodeClassifications[edge.sourceNodeId],
        target: nodeClassifications[edge.targetNodeId],
        orderByLayerPath,
      });
      edgeClassifications[edge.edgeId] = classification;
      if (classification.isArchitectureViolation) {
        violationEdgeIds.push(edge.edgeId);
        diagnostics.push({
          code: 'ARCHITECTURE_REVERSE_EDGE',
          severity: 'warning',
          message: 'Edge direction is reverse to the configured layer order.',
          edgeId: edge.edgeId,
        });
      }
    }

    const ignoredFilePaths = new Set<string>();
    let ignoredNodeCount = 0;
    for (const classification of Object.values(nodeClassifications)) {
      if (classification.status === 'ignored') {
        ignoredNodeCount += 1;
        if (classification.normalizedFilePath) {
          ignoredFilePaths.add(classification.normalizedFilePath);
        }
      }
    }

    return {
      nodeClassifications,
      edgeClassifications,
      unclassifiedSummary: buildUnclassifiedDirectorySuggestions({
        classifications: Object.values(nodeClassifications),
      }),
      ignoredSummary: {
        nodeCount: ignoredNodeCount,
        fileCount: ignoredFilePaths.size,
      },
      violationEdgeIds,
      diagnostics,
    };
  }
}
