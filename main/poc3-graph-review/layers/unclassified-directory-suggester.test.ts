import { describe, expect, it } from 'vitest';
import type { GraphNodeLayerClassification } from '../../../shared/poc3-domain/layer-profile';
import { buildUnclassifiedDirectorySuggestions } from './unclassified-directory-suggester';

function unclassified(nodeId: string, filePath: string): GraphNodeLayerClassification {
  return {
    nodeId,
    filePath,
    normalizedFilePath: filePath,
    status: 'unclassified',
    layerPath: null,
    layerRuleId: null,
    matchedLayerRuleIds: [],
    conflictingLayerRuleIds: [],
    ignoredPatternId: null,
  };
}

describe('buildUnclassifiedDirectorySuggestions', () => {
  it('separates nodeCount from distinct fileCount and suggests directory globs', () => {
    const summary = buildUnclassifiedDirectorySuggestions({
      classifications: [
        unclassified('node-1', 'renderer/features/foo/a.ts'),
        unclassified('node-2', 'renderer/features/foo/a.ts'),
        unclassified('node-3', 'renderer/features/foo/b.ts'),
        unclassified('node-4', 'scripts/tool.ts'),
      ],
    });
    expect(summary.nodeCount).toBe(4);
    expect(summary.fileCount).toBe(3);
    expect(summary.directories[0]).toMatchObject({
      directoryPath: 'renderer/features/foo',
      nodeCount: 3,
      fileCount: 2,
      suggestedGlob: 'renderer/features/foo/**',
    });
  });
});
