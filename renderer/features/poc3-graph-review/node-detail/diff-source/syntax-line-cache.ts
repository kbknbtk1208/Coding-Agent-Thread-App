import { highlighter as diffHighlighter } from '@git-diff-view/lowlight';

const MAX_SYNTAX_LINE_CACHE_SIZE = 2000;
const CACHE_TRIM_RATIO = 0.25;

export type SyntaxLine = ReturnType<typeof buildSyntaxLine>;

interface SyntaxLineCacheEntry {
  value: SyntaxLine;
  lastUsedAt: number;
}

const syntaxLineCache = new Map<string, SyntaxLineCacheEntry>();
let accessCounter = 0;

export function getCachedSyntaxLine({
  text,
  filePath,
  language,
}: {
  text: string;
  filePath: string;
  language: string;
}): SyntaxLine {
  if (text.length === 0) {
    return null;
  }

  const cacheKey = buildSyntaxLineCacheKey({ text, filePath, language });
  const cached = syntaxLineCache.get(cacheKey);
  accessCounter += 1;

  if (cached) {
    cached.lastUsedAt = accessCounter;
    return cached.value;
  }

  const value = buildSyntaxLine(text, filePath, language);
  syntaxLineCache.set(cacheKey, { value, lastUsedAt: accessCounter });
  trimSyntaxLineCache();
  return value;
}

export function getSyntaxLineCacheSize(): number {
  return syntaxLineCache.size;
}

export function clearSyntaxLineCache() {
  syntaxLineCache.clear();
  accessCounter = 0;
}

function buildSyntaxLine(text: string, filePath: string, language: string) {
  try {
    const ast = diffHighlighter.getAST(text, filePath, language, 'dark');
    return diffHighlighter.processAST(ast).syntaxFileObject[1] ?? null;
  } catch {
    return null;
  }
}

function buildSyntaxLineCacheKey({
  text,
  filePath,
  language,
}: {
  text: string;
  filePath: string;
  language: string;
}): string {
  return `${language}\0${filePath}\0${text}`;
}

function trimSyntaxLineCache() {
  if (syntaxLineCache.size <= MAX_SYNTAX_LINE_CACHE_SIZE) {
    return;
  }

  const trimCount = Math.ceil(MAX_SYNTAX_LINE_CACHE_SIZE * CACHE_TRIM_RATIO);
  const entries = Array.from(syntaxLineCache.entries()).sort(
    (a, b) => a[1].lastUsedAt - b[1].lastUsedAt,
  );

  for (const [key] of entries.slice(0, trimCount)) {
    syntaxLineCache.delete(key);
  }
}
