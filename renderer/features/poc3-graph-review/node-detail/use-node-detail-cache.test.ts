import { describe, expect, it } from 'vitest';
import type { NodeDetailSnapshot } from '../../../../shared/poc3-contracts/graph-review-ipc';
import {
  buildNodeDetailCacheKey,
  clearActiveSnapshotCache,
  createNodeDetailCacheRoot,
  getScopeNodeDetailCache,
  getSnapshotNodeDetailCache,
  retainOnlyActiveSnapshot,
} from './use-node-detail';

describe('node detail cache helpers', () => {
  it('retains only the active snapshot inside the current scope', () => {
    const root = createNodeDetailCacheRoot();
    const scope = getScopeNodeDetailCache(root, 'workspace-1', 'scope-1');
    const oldSnapshot = getSnapshotNodeDetailCache(scope, 'snapshot-1');
    oldSnapshot.detailsByNodeAndMode.set(buildNodeDetailCacheKey('node-1', 'function'), detail());
    const activeSnapshot = getSnapshotNodeDetailCache(scope, 'snapshot-2');
    activeSnapshot.detailsByNodeAndMode.set(
      buildNodeDetailCacheKey('node-2', 'function'),
      detail(),
    );

    const retained = retainOnlyActiveSnapshot(scope, 'snapshot-2');

    expect(retained).toBe(activeSnapshot);
    expect(scope.snapshots.has('snapshot-1')).toBe(false);
    expect(scope.snapshots.has('snapshot-2')).toBe(true);
  });

  it('clears only the active snapshot for refresh', () => {
    const root = createNodeDetailCacheRoot();
    const activeScope = getScopeNodeDetailCache(root, 'workspace-1', 'scope-1');
    const otherScope = getScopeNodeDetailCache(root, 'workspace-2', 'scope-1');
    getSnapshotNodeDetailCache(activeScope, 'snapshot-1').detailsByNodeAndMode.set(
      buildNodeDetailCacheKey('node-1', 'function'),
      detail(),
    );
    getSnapshotNodeDetailCache(otherScope, 'snapshot-1').detailsByNodeAndMode.set(
      buildNodeDetailCacheKey('node-1', 'function'),
      detail(),
    );

    clearActiveSnapshotCache(root, 'workspace-1', 'scope-1', 'snapshot-1');

    expect(activeScope.snapshots.has('snapshot-1')).toBe(false);
    expect(otherScope.snapshots.has('snapshot-1')).toBe(true);
  });
});

function detail(): NodeDetailSnapshot {
  return { nodeId: 'node-1' } as NodeDetailSnapshot;
}
