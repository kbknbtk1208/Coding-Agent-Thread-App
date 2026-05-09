import ts from 'typescript';
import type {
  NodeCodeExcerptLanguage,
  TestCaseKind,
  TestCaseModifier,
  TestCaseTreeNode,
} from '../../../shared/poc3-domain/node-detail';

export interface ExtractTestCaseDiagnostic {
  code: 'test-case-extract-failed' | 'test-case-extract-partial';
  message: string;
}

export interface ExtractTestCasesResult {
  testCases: TestCaseTreeNode[];
  diagnostics: ExtractTestCaseDiagnostic[];
}

export interface ExtractTestCasesInput {
  content: string;
  language: NodeCodeExcerptLanguage;
  baseLine: number;
}

const KIND_MAP: Record<string, TestCaseKind> = {
  it: 'it',
  test: 'test',
  describe: 'describe',
  xit: 'it',
  xtest: 'test',
  xdescribe: 'describe',
};

const X_MODIFIED = new Set(['xit', 'xtest', 'xdescribe']);

const MODIFIER_PRIORITY: TestCaseModifier[] = ['skip', 'only', 'todo', 'each'];

export function isAstSupportedLanguage(language: NodeCodeExcerptLanguage): boolean {
  return language === 'ts' || language === 'tsx' || language === 'mts' || language === 'cts';
}

export function extractTestCases(input: ExtractTestCasesInput): ExtractTestCasesResult {
  const { content, language, baseLine } = input;
  if (!isAstSupportedLanguage(language)) {
    return { testCases: [], diagnostics: [] };
  }
  const diagnostics: ExtractTestCaseDiagnostic[] = [];
  try {
    const scriptKind = language === 'tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      'companion.ts',
      content,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );
    const root: TestCaseTreeNode[] = [];
    visit(sourceFile, sourceFile, root, baseLine, diagnostics);
    return { testCases: root, diagnostics };
  } catch (error) {
    return {
      testCases: [],
      diagnostics: [
        {
          code: 'test-case-extract-failed',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function visit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  currentChildren: TestCaseTreeNode[],
  baseLine: number,
  diagnostics: ExtractTestCaseDiagnostic[],
): void {
  if (ts.isCallExpression(node)) {
    const info = analyzeCallExpression(node, diagnostics);
    if (info) {
      const treeNode = buildTreeNode(node, info, sourceFile, baseLine);
      currentChildren.push(treeNode);
      if (info.kind === 'describe') {
        descendIntoDescribeCallback(
          node,
          info,
          sourceFile,
          treeNode.children,
          baseLine,
          diagnostics,
        );
        return;
      }
      // it/test の中までは降りない（assertion 抽出は将来対応）
      return;
    }
  }
  ts.forEachChild(node, (child) =>
    visit(child, sourceFile, currentChildren, baseLine, diagnostics),
  );
}

interface CallInfo {
  kind: TestCaseKind;
  modifier: TestCaseModifier;
  labelArgNode: ts.Node | null;
}

function analyzeCallExpression(
  node: ts.CallExpression,
  diagnostics: ExtractTestCaseDiagnostic[],
): CallInfo | null {
  const expression = node.expression;

  // パターン 1: it(...) / test(...) / describe(...) / xit など
  if (ts.isIdentifier(expression)) {
    const name = expression.text;
    const kind = KIND_MAP[name];
    if (!kind) return null;
    const modifier: TestCaseModifier = X_MODIFIED.has(name) ? 'skip' : null;
    return {
      kind,
      modifier,
      labelArgNode: node.arguments[0] ?? null,
    };
  }

  // パターン 2: it.skip(...) / it.only(...) / it.todo(...) / it.each / xit.skip 等
  if (ts.isPropertyAccessExpression(expression)) {
    const modifierInfo = resolvePropertyAccessChain(expression, diagnostics);
    if (!modifierInfo) return null;
    return {
      kind: modifierInfo.kind,
      modifier: modifierInfo.modifier,
      labelArgNode: node.arguments[0] ?? null,
    };
  }

  // パターン 3: it.each(table)('label', ...)
  if (ts.isCallExpression(expression)) {
    const inner = expression.expression;
    if (ts.isPropertyAccessExpression(inner)) {
      const modifierInfo = resolvePropertyAccessChain(inner, diagnostics);
      if (!modifierInfo) return null;
      // each 形式の場合、modifier は each（ただし skip 等の方が優先される複合は分岐）
      const finalModifier = pickPriority(modifierInfo.modifier, 'each');
      return {
        kind: modifierInfo.kind,
        modifier: finalModifier,
        labelArgNode: node.arguments[0] ?? null,
      };
    }
  }

  return null;
}

interface PropertyAccessInfo {
  kind: TestCaseKind;
  modifier: TestCaseModifier;
}

function resolvePropertyAccessChain(
  expression: ts.PropertyAccessExpression,
  diagnostics: ExtractTestCaseDiagnostic[],
): PropertyAccessInfo | null {
  const modifiers: TestCaseModifier[] = [];
  let current: ts.Expression = expression;

  // 最深の Identifier に至るまで .name を集める
  while (ts.isPropertyAccessExpression(current)) {
    const name = current.name.text;
    const m = nameToModifier(name);
    if (m) {
      modifiers.push(m);
    } else {
      // 想定外のプロパティ（例: it.skip.foo）
      diagnostics.push({
        code: 'test-case-extract-partial',
        message: `unknown property in chain: ${name}`,
      });
      return null;
    }
    current = current.expression;
  }
  if (!ts.isIdentifier(current)) return null;
  const baseName = current.text;
  const baseKind = KIND_MAP[baseName];
  if (!baseKind) return null;
  if (X_MODIFIED.has(baseName)) {
    modifiers.push('skip');
  }

  let modifier: TestCaseModifier = null;
  for (const candidate of MODIFIER_PRIORITY) {
    if (modifiers.includes(candidate)) {
      modifier = candidate;
      break;
    }
  }
  return { kind: baseKind, modifier };
}

function nameToModifier(name: string): TestCaseModifier {
  if (name === 'skip' || name === 'only' || name === 'todo' || name === 'each') {
    return name;
  }
  return null;
}

function pickPriority(a: TestCaseModifier, b: TestCaseModifier): TestCaseModifier {
  for (const candidate of MODIFIER_PRIORITY) {
    if (a === candidate || b === candidate) return candidate;
  }
  return a ?? b;
}

function buildTreeNode(
  node: ts.CallExpression,
  info: CallInfo,
  sourceFile: ts.SourceFile,
  baseLine: number,
): TestCaseTreeNode {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    kind: info.kind,
    label: extractLabel(info.labelArgNode),
    modifier: info.modifier,
    line: baseLine + start.line,
    endLine: baseLine + end.line,
    children: [],
  };
}

function extractLabel(arg: ts.Node | null): string {
  if (!arg) return '<dynamic>';
  if (ts.isStringLiteral(arg)) return arg.text;
  if (ts.isNoSubstitutionTemplateLiteral(arg)) return arg.text;
  if (ts.isTemplateExpression(arg)) {
    let result = arg.head.text;
    for (const span of arg.templateSpans) {
      result += '${...}';
      result += span.literal.text;
    }
    return result;
  }
  return '<dynamic>';
}

function descendIntoDescribeCallback(
  node: ts.CallExpression,
  info: CallInfo,
  sourceFile: ts.SourceFile,
  children: TestCaseTreeNode[],
  baseLine: number,
  diagnostics: ExtractTestCaseDiagnostic[],
): void {
  // each 形式 (describe.each(table)('label', cb)) の場合 callback は最終 CallExpression の引数
  // 通常形式 (describe('label', cb)) の場合は arguments の最後の関数式
  const callbackArg = findCallbackArgument(node);
  if (!callbackArg) {
    if (info.modifier === null && info.kind === 'describe') {
      // describe('foo') の単一引数 (todo 形式に近い) は描画上問題なし、降りる必要なし
    }
    return;
  }
  const body = (callbackArg as ts.FunctionLikeDeclaration).body;
  if (!body) return;
  ts.forEachChild(body, (child) => visit(child, sourceFile, children, baseLine, diagnostics));
}

function findCallbackArgument(node: ts.CallExpression): ts.Node | null {
  for (let i = node.arguments.length - 1; i >= 0; i--) {
    const arg = node.arguments[i];
    if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
      return arg;
    }
  }
  return null;
}
