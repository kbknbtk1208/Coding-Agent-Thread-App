import { describe, expect, it } from 'vitest';
import type { CodeGraphSnapshot } from '../../../shared/poc3-domain/graph';
import type { RepositoryLayerProfile } from '../../../shared/poc3-domain/layer-profile';
import { LayerClassificationService } from './layer-classification-service';

function profile(): RepositoryLayerProfile {
  return {
    layerProfileId: 'profile-1',
    repositoryProfileId: 'repo-1',
    repositoryIdentityKey: 'identity-1',
    schemaVersion: 1,
    profileVersion: 1,
    displayName: 'Default',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules: [
      {
        layerRuleId: 'frontend',
        glob: 'renderer/**',
        layerPath: 'frontend',
        displayName: 'Frontend',
        description: null,
        order: 10,
        priority: 1,
        enabled: true,
      },
      {
        layerRuleId: 'backend',
        glob: 'main/**',
        layerPath: 'backend',
        displayName: 'Backend',
        description: null,
        order: 20,
        priority: 1,
        enabled: true,
      },
      {
        layerRuleId: 'tests',
        glob: '**/*.test.ts',
        layerPath: 'test',
        displayName: 'Test',
        description: null,
        order: 30,
        priority: 100,
        enabled: true,
      },
    ],
    ignoredPatterns: [
      {
        ignorePatternId: 'ignore-generated',
        glob: 'generated/**',
        reason: null,
        enabled: true,
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastAppliedAt: null,
  };
}

function graph(): CodeGraphSnapshot {
  return {
    graphSnapshotId: 'graph-1',
    revisionId: 'rev-1',
    scopeKey: 'scope',
    status: 'ready',
    nodes: [
      {
        nodeId: 'frontend-node',
        stableSymbolId: 's1',
        parentNodeId: null,
        kind: 'function',
        label: 'front',
        filePath: 'renderer/page.tsx',
        declarationRange: null,
        diffStatus: 'changed',
        isDiffNode: true,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'backend-node',
        stableSymbolId: 's2',
        parentNodeId: null,
        kind: 'function',
        label: 'back',
        filePath: 'main/service.ts',
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'test-node',
        stableSymbolId: 's3',
        parentNodeId: null,
        kind: 'function',
        label: 'test',
        filePath: 'tests/service.test.ts',
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'generated-node',
        stableSymbolId: 's4',
        parentNodeId: null,
        kind: 'function',
        label: 'generated',
        filePath: 'generated/client.ts',
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'unknown-node',
        stableSymbolId: 's5',
        parentNodeId: null,
        kind: 'function',
        label: 'unknown',
        filePath: 'scripts/tool.ts',
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'external-node',
        stableSymbolId: 's6',
        parentNodeId: null,
        kind: 'external',
        label: 'external',
        filePath: null,
        declarationRange: null,
        diffStatus: 'external',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
      {
        nodeId: 'scope-node',
        stableSymbolId: 's7',
        parentNodeId: null,
        kind: 'function',
        label: 'scope',
        filePath: null,
        declarationRange: null,
        diffStatus: 'related',
        isDiffNode: false,
        changedLineNumbers: [],
        badges: { changedLines: 0, remoteThreadCount: 0, findingCount: 0 },
      },
    ],
    edges: [
      {
        edgeId: 'expected-edge',
        sourceNodeId: 'frontend-node',
        targetNodeId: 'backend-node',
        kind: 'calls',
        confidence: 'high',
      },
      {
        edgeId: 'reverse-edge',
        sourceNodeId: 'backend-node',
        targetNodeId: 'frontend-node',
        kind: 'calls',
        confidence: 'high',
      },
      {
        edgeId: 'external-edge',
        sourceNodeId: 'frontend-node',
        targetNodeId: 'external-node',
        kind: 'calls',
        confidence: 'high',
      },
    ],
    companionFiles: [],
    limits: {
      nodeLimit: 100,
      edgeLimit: 100,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      reason: 'none',
    },
    diagnostics: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('LayerClassificationService', () => {
  it('classifies nodes and edge directions', () => {
    const result = new LayerClassificationService().classify({
      graph: graph(),
      profile: profile(),
    });
    expect(result.nodeClassifications['frontend-node'].status).toBe('classified');
    expect(result.nodeClassifications['backend-node'].layerPath).toBe('backend');
    expect(result.nodeClassifications['test-node'].status).toBe('classified');
    expect(result.nodeClassifications['generated-node'].status).toBe('ignored');
    expect(result.nodeClassifications['unknown-node'].status).toBe('unclassified');
    expect(result.nodeClassifications['external-node'].status).toBe('external');
    expect(result.nodeClassifications['scope-node'].status).toBe('outOfScope');
    expect(result.edgeClassifications['expected-edge'].direction).toBe('expected');
    expect(result.edgeClassifications['reverse-edge'].direction).toBe('reverse');
    expect(result.edgeClassifications['reverse-edge'].isArchitectureViolation).toBe(true);
    expect(result.edgeClassifications['external-edge'].direction).toBe('external');
    expect(result.unclassifiedSummary.nodeCount).toBe(1);
    expect(result.ignoredSummary.nodeCount).toBe(1);
  });

  it('treats test files as out of scope when no explicit rule matches', () => {
    const noTestProfile = {
      ...profile(),
      profileVersion: 2,
      rules: profile().rules.filter((rule) => rule.layerRuleId !== 'tests'),
    };
    const result = new LayerClassificationService().classify({
      graph: graph(),
      profile: noTestProfile,
    });
    expect(result.nodeClassifications['test-node'].status).toBe('outOfScope');
  });
});
