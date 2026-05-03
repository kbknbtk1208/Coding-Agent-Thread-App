'use client';

import { highlighter as diffHighlighter, type SyntaxNode } from '@git-diff-view/lowlight';
import { memo, useMemo } from 'react';

export function resolveHighlightLanguage(filePath: string): string {
  const normalized = filePath.toLowerCase();

  if (
    normalized.endsWith('.ts') ||
    normalized.endsWith('.d.ts') ||
    normalized.endsWith('.mts') ||
    normalized.endsWith('.cts')
  ) {
    return 'typescript';
  }
  if (normalized.endsWith('.tsx')) {
    return 'tsx';
  }
  if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
    return 'javascript';
  }
  if (normalized.endsWith('.jsx')) {
    return 'jsx';
  }
  if (normalized.endsWith('.json')) {
    return 'json';
  }
  if (normalized.endsWith('.css')) {
    return 'css';
  }
  if (normalized.endsWith('.scss')) {
    return 'scss';
  }
  if (normalized.endsWith('.less')) {
    return 'less';
  }
  if (
    normalized.endsWith('.html') ||
    normalized.endsWith('.htm') ||
    normalized.endsWith('.xml') ||
    normalized.endsWith('.svg')
  ) {
    return 'xml';
  }
  if (normalized.endsWith('.md')) {
    return 'markdown';
  }
  if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) {
    return 'yaml';
  }
  if (normalized.endsWith('.sh') || normalized.endsWith('.bash') || normalized.endsWith('.zsh')) {
    return 'shell';
  }
  if (normalized.endsWith('.ps1') || normalized.endsWith('.psm1') || normalized.endsWith('.psd1')) {
    return 'powershell';
  }
  if (normalized.endsWith('.py')) {
    return 'python';
  }
  if (normalized.endsWith('.go')) {
    return 'go';
  }
  if (normalized.endsWith('.rs')) {
    return 'rust';
  }
  if (normalized.endsWith('.java')) {
    return 'java';
  }
  if (normalized.endsWith('.kt') || normalized.endsWith('.kts')) {
    return 'kotlin';
  }
  if (normalized.endsWith('.swift')) {
    return 'swift';
  }
  if (normalized.endsWith('.rb')) {
    return 'ruby';
  }
  if (normalized.endsWith('.php')) {
    return 'php';
  }
  if (normalized.endsWith('.sql')) {
    return 'sql';
  }
  if (normalized.endsWith('.c')) {
    return 'c';
  }
  if (normalized.endsWith('.cc') || normalized.endsWith('.cpp') || normalized.endsWith('.cxx')) {
    return 'cpp';
  }
  if (normalized.endsWith('.cs')) {
    return 'csharp';
  }

  return 'plaintext';
}

function buildSyntaxLine(text: string, filePath: string, language: string) {
  if (text.length === 0) {
    return null;
  }

  try {
    const ast = diffHighlighter.getAST(text, filePath, language, 'dark');
    return diffHighlighter.processAST(ast).syntaxFileObject[1] ?? null;
  } catch {
    return null;
  }
}

function renderSyntaxEntry(node: SyntaxNode, key: string, wrapper?: SyntaxNode) {
  const content = renderSyntaxNode(node, `${key}:node`);
  if (!wrapper) {
    return content;
  }

  return (
    <span key={`${key}:wrapper`} className={joinClassNames(wrapper.properties?.className)}>
      {content}
    </span>
  );
}

function renderSyntaxNode(node: SyntaxNode, key: string) {
  if (node.children && node.children.length > 0) {
    return (
      <span key={key} className={joinClassNames(node.properties?.className)}>
        {node.children.map((child, index) => renderSyntaxNode(child, `${key}:${index}`))}
      </span>
    );
  }

  if (node.properties?.className?.length) {
    return (
      <span key={key} className={joinClassNames(node.properties.className)}>
        {node.value}
      </span>
    );
  }

  return <span key={key}>{node.value}</span>;
}

function joinClassNames(classNames?: string[]) {
  return classNames?.filter(Boolean).join(' ') || undefined;
}

export const HighlightedSourceLine = memo(function HighlightedSourceLine({
  text,
  filePath,
  language,
}: {
  text: string;
  filePath: string;
  language: string;
}) {
  const syntaxLine = useMemo(
    () => buildSyntaxLine(text, filePath, language),
    [filePath, language, text],
  );

  if (!syntaxLine) {
    return <>{text.length > 0 ? text : ' '}</>;
  }

  return (
    <span className="diff-line-syntax-raw">
      <code className="hljs">
        {syntaxLine.nodeList.map((entry, index) =>
          renderSyntaxEntry(entry.node, `${index}`, entry.wrapper),
        )}
      </code>
    </span>
  );
});
