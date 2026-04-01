import { expect, test } from 'vitest';
import type { AgentKind, ConversationTurn, ProgressHint } from './agent.ts';
import { applyMessageDeltaToTurn, applyProgressHintToTurn } from './intermediate-segments.ts';

function createTurn(): ConversationTurn {
  return {
    intermediateSegments: [],
    messageId: 'message-1',
    prompt: 'prompt',
    response: '',
    responseMode: 'richText',
    result: undefined,
    startedAt: '2026-03-27T00:00:00.000Z',
    status: 'starting',
    turnId: 'turn-1',
  };
}

function progressHint(text: string, updatedAt: string): ProgressHint {
  return {
    kind: 'reasoning',
    text,
    updatedAt,
  };
}

function applyDelta(turn: ConversationTurn, agent: AgentKind, text: string, updatedAt: string) {
  return applyMessageDeltaToTurn(turn, agent, text, updatedAt);
}

test('progress -> delta -> progress -> delta で message segment が段分けされる', () => {
  let turn = createTurn();

  turn = applyProgressHintToTurn(
    turn,
    progressHint('考えています...', '2026-03-27T00:00:00.000Z'),
    '2026-03-27T00:00:00.000Z',
  );
  turn = applyDelta(turn, 'codex', '途中レスポンス1', '2026-03-27T00:00:00.100Z');
  turn = applyProgressHintToTurn(
    turn,
    progressHint('検索しています...', '2026-03-27T00:00:00.200Z'),
    '2026-03-27T00:00:00.200Z',
  );
  turn = applyDelta(turn, 'codex', '途中レスポンス2', '2026-03-27T00:00:00.300Z');

  expect(turn.intermediateSegments).toHaveLength(2);
  expect(
    turn.intermediateSegments.map((segment) => ({
      kind: segment.kind,
      text: segment.text,
    })),
  ).toEqual([
    { kind: 'message', text: '途中レスポンス1' },
    { kind: 'message', text: '途中レスポンス2' },
  ]);
});

test('progress -> progress -> delta で progress segment は増えず最後の hint が置き換わる', () => {
  let turn = createTurn();

  turn = applyProgressHintToTurn(
    turn,
    progressHint('考えています...', '2026-03-27T00:00:00.000Z'),
    '2026-03-27T00:00:00.000Z',
  );
  turn = applyProgressHintToTurn(
    turn,
    progressHint('検索しています...', '2026-03-27T00:00:00.100Z'),
    '2026-03-27T00:00:00.100Z',
  );
  turn = applyDelta(turn, 'codex', '途中レスポンス', '2026-03-27T00:00:00.200Z');

  expect(turn.intermediateSegments).toHaveLength(1);
  expect(turn.intermediateSegments[0]).toEqual({
    kind: 'message',
    progressKind: undefined,
    segmentId: 'turn-1:segment:1',
    text: '途中レスポンス',
    updatedAt: '2026-03-27T00:00:00.200Z',
  });
});

test('Copilot は 500ms 以内なら同じ message segment に追記する', () => {
  let turn = createTurn();

  turn = applyDelta(turn, 'copilot', 'A', '2026-03-27T00:00:00.000Z');
  turn = applyDelta(turn, 'copilot', 'B', '2026-03-27T00:00:00.400Z');

  expect(turn.intermediateSegments).toHaveLength(1);
  expect(turn.intermediateSegments[0].text).toBe('AB');
});

test('Copilot は 500ms を超える無通信で新しい message segment を作る', () => {
  let turn = createTurn();

  turn = applyDelta(turn, 'copilot', 'A', '2026-03-27T00:00:00.000Z');
  turn = applyDelta(turn, 'copilot', 'B', '2026-03-27T00:00:00.700Z');

  expect(turn.intermediateSegments).toHaveLength(2);
  expect(turn.intermediateSegments.map((segment) => segment.text)).toEqual(['A', 'B']);
});

test('Codex は hint が無い限り長い間隔でも同じ message segment に追記する', () => {
  let turn = createTurn();

  turn = applyDelta(turn, 'codex', 'A', '2026-03-27T00:00:00.000Z');
  turn = applyDelta(turn, 'codex', 'B', '2026-03-27T00:00:02.000Z');

  expect(turn.intermediateSegments).toHaveLength(1);
  expect(turn.intermediateSegments[0].text).toBe('AB');
});
