import { describe, expect, it } from 'vitest';
import { createGraphSnapshot } from './graph-test-fixtures';
import { toReactFlowElements } from './to-react-flow-elements';

describe('toReactFlowElements', () => {
  it('applies selected and highlighted view state during conversion', () => {
    const elements = toReactFlowElements(createGraphSnapshot(), {
      selectedNodeId: 'node-2',
      highlightedFilePath: 'src/target.ts',
    });

    expect(elements.nodes.map((node) => [node.id, node.selected === true])).toEqual([
      ['node-1', false],
      ['node-2', true],
    ]);
    expect(elements.nodes.map((node) => [node.id, node.data.isFileHighlighted])).toEqual([
      ['node-1', false],
      ['node-2', true],
    ]);
  });
});
