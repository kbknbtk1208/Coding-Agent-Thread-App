import { describe, expect, it } from 'vitest';
import { createGraphSnapshot, createLayeredGraphSnapshot } from './graph-test-fixtures';
import {
  createStableFlowElementCache,
  reconcileReactFlowElements,
} from './use-stable-react-flow-elements';

describe('reconcileReactFlowElements', () => {
  it('reuses node and edge references when graph and view state are unchanged', () => {
    const graph = createGraphSnapshot();
    const first = reconcileReactFlowElements(
      graph,
      emptyViewState(),
      createStableFlowElementCache(),
    );
    const second = reconcileReactFlowElements(graph, emptyViewState(), first.cache);

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[1]).toBe(first.nodes[1]);
    expect(second.edges[0]).toBe(first.edges[0]);
  });

  it('changes only affected node references when selection changes', () => {
    const graph = createGraphSnapshot();
    const first = reconcileReactFlowElements(
      graph,
      emptyViewState(),
      createStableFlowElementCache(),
    );
    const second = reconcileReactFlowElements(
      graph,
      { selectedNodeId: 'node-2', highlightedFilePath: null },
      first.cache,
    );

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.nodes[1].selected).toBe(true);
    expect(second.edges[0]).toBe(first.edges[0]);
  });

  it('changes only affected node references when file highlight changes', () => {
    const graph = createGraphSnapshot();
    const first = reconcileReactFlowElements(
      graph,
      emptyViewState(),
      createStableFlowElementCache(),
    );
    const second = reconcileReactFlowElements(
      graph,
      { selectedNodeId: null, highlightedFilePath: 'src/target.ts' },
      first.cache,
    );

    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.nodes[1]).not.toBe(first.nodes[1]);
    expect(second.nodes[1].data.isFileHighlighted).toBe(true);
  });

  it('reuses code node references for layered graph when nothing changes', () => {
    const graph = createLayeredGraphSnapshot();
    const first = reconcileReactFlowElements(
      graph,
      emptyViewState(),
      createStableFlowElementCache(),
    );
    const second = reconcileReactFlowElements(graph, emptyViewState(), first.cache);

    expect(first.nodes.every((node) => node.data.kind === 'code')).toBe(true);
    expect(second.nodes[0]).toBe(first.nodes[0]);
    expect(second.edges[0]).toBe(first.edges[0]);
  });

  it('refreshes node and edge references when viewport interaction mode changes', () => {
    const graph = createLayeredGraphSnapshot();
    const first = reconcileReactFlowElements(
      graph,
      emptyViewState(),
      createStableFlowElementCache(),
    );
    const second = reconcileReactFlowElements(
      graph,
      { ...emptyViewState(), isViewportInteracting: true },
      first.cache,
    );

    expect(second.nodes[0]).not.toBe(first.nodes[0]);
    expect(second.nodes[0].data.isViewportInteracting).toBe(true);
    expect(second.edges[0]).not.toBe(first.edges[0]);
    expect(second.edges[0].animated).toBe(false);
  });
});

function emptyViewState() {
  return { selectedNodeId: null, highlightedFilePath: null };
}
