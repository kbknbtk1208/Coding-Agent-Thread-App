import { describe, expect, it } from 'vitest';
import { extractTestCases } from '../test-case-extractor';

function extract(content: string, baseLine = 1, language: 'ts' | 'tsx' = 'ts') {
  return extractTestCases({ content, language, baseLine });
}

describe('extractTestCases', () => {
  it('単純な describe + it を抽出する', () => {
    const result = extract(`describe('outer', () => {
  it('does a thing', () => {});
});`);
    expect(result.diagnostics).toEqual([]);
    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].kind).toBe('describe');
    expect(result.testCases[0].label).toBe('outer');
    expect(result.testCases[0].children).toHaveLength(1);
    expect(result.testCases[0].children[0].kind).toBe('it');
    expect(result.testCases[0].children[0].label).toBe('does a thing');
  });

  it('複数階層の describe ネストを保持する', () => {
    const result = extract(`describe('a', () => {
  describe('b', () => {
    it('c', () => {});
  });
});`);
    const a = result.testCases[0];
    expect(a.children[0].label).toBe('b');
    expect(a.children[0].children[0].label).toBe('c');
  });

  it('it.skip / xit / it.only / it.todo の modifier を判定する', () => {
    const result = extract(`it.skip('a', () => {});
xit('b', () => {});
it.only('c', () => {});
it.todo('d');`);
    const labels = result.testCases.map((n) => [n.label, n.modifier]);
    expect(labels).toEqual([
      ['a', 'skip'],
      ['b', 'skip'],
      ['c', 'only'],
      ['d', 'todo'],
    ]);
    for (const node of result.testCases) {
      expect(node.kind).toBe('it');
    }
  });

  it('it.each(table)(label, fn) の label を抽出する', () => {
    const result = extract(`it.each([[1], [2]])('handles %s', (v) => {});`);
    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].kind).toBe('it');
    expect(result.testCases[0].modifier).toBe('each');
    expect(result.testCases[0].label).toBe('handles %s');
  });

  it('テンプレートリテラルラベルを placeholder 化する', () => {
    const result = extract('it(`should handle ${value} now`, () => {});');
    expect(result.testCases[0].label).toBe('should handle ${...} now');
  });

  it('文字列以外の引数は <dynamic> として表示する', () => {
    const result = extract(`it(LABEL, () => {});`);
    expect(result.testCases[0].label).toBe('<dynamic>');
  });

  it('構文エラーがあっても部分的に抽出される', () => {
    const result = extract(`describe('outer', () => {
  it('inner', () => {});
  function broken( {
});`);
    // 完全な失敗ではなく、抽出可能な部分は返る
    expect(result.testCases.length).toBeGreaterThan(0);
  });

  it('対象外の関数 (bench など) は無視する', () => {
    const result = extract(`bench('not a test', () => {});
it('actual', () => {});`);
    expect(result.testCases).toHaveLength(1);
    expect(result.testCases[0].label).toBe('actual');
  });

  it('tsx ファイル (JSX 含む) を解析できる', () => {
    const result = extract(
      `it('renders', () => {
  const el = <div>hello</div>;
});`,
      1,
      'tsx',
    );
    expect(result.testCases[0].label).toBe('renders');
  });

  it('空ファイルで空配列を返す', () => {
    const result = extract('');
    expect(result.testCases).toEqual([]);
  });

  it('baseLine が 1 以外でも絶対行が得られる', () => {
    const result = extract(`it('x', () => {});`, 100);
    expect(result.testCases[0].line).toBe(100);
  });

  it('xdescribe は describe + skip', () => {
    const result = extract(`xdescribe('outer', () => {
  it('inner', () => {});
});`);
    expect(result.testCases[0].kind).toBe('describe');
    expect(result.testCases[0].modifier).toBe('skip');
    expect(result.testCases[0].children[0].label).toBe('inner');
  });

  it('text 言語は空配列を即時返却する', () => {
    const result = extractTestCases({
      content: `it('x', () => {})`,
      language: 'text',
      baseLine: 1,
    });
    expect(result.testCases).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });
});
