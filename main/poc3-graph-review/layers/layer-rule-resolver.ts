import path from 'path';
import picomatch from 'picomatch';
import type {
  GraphLayerDiagnostic,
  RepositoryLayerIgnorePattern,
  RepositoryLayerProfile,
  RepositoryLayerRule,
} from '../../../shared/poc3-domain/layer-profile';

export interface NormalizedRepoPathResult {
  ok: true;
  path: string;
}

export interface RejectedRepoPathResult {
  ok: false;
  reason: 'empty' | 'absoluteWithoutRoot' | 'outsideRepository' | 'parentTraversal';
  normalizedPath: string | null;
}

export type RepoPathNormalizationResult = NormalizedRepoPathResult | RejectedRepoPathResult;

export interface LayerRuleResolverOptions {
  worktreeRootPath?: string | null;
}

export interface LayerRuleResolution {
  filePath: string;
  status: 'matched' | 'ignored' | 'unmatched' | 'rejected';
  layerRule: RepositoryLayerRule | null;
  ignoredPattern: RepositoryLayerIgnorePattern | null;
  matchedLayerRuleIds: string[];
  conflictingLayerRuleIds: string[];
  diagnostics: GraphLayerDiagnostic[];
}

interface CompiledRule {
  rule: RepositoryLayerRule;
  definitionIndex: number;
  specificity: GlobSpecificity;
  isMatch: (input: string) => boolean;
}

interface CompiledIgnorePattern {
  pattern: RepositoryLayerIgnorePattern;
  isMatch: (input: string) => boolean;
}

interface GlobSpecificity {
  literalSegmentCount: number;
  wildcardTokenCount: number;
  patternLength: number;
}

interface CompiledProfile {
  key: string;
  rules: CompiledRule[];
  ignoredPatterns: CompiledIgnorePattern[];
  diagnostics: GraphLayerDiagnostic[];
}

const compiledProfileCache = new Map<string, CompiledProfile>();

function normalizeUnicode(input: string): string {
  return input.normalize('NFC');
}

function looksLikeWindowsAbsolutePath(input: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(input) || input.startsWith('\\\\');
}

function hasDriveLetter(input: string): boolean {
  return /^[a-zA-Z]:/.test(input);
}

function toPosixPath(input: string): string {
  return normalizeUnicode(input).replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripLeadingSlashes(input: string): string {
  return input.replace(/^\/+/, '');
}

function isParentTraversal(input: string): boolean {
  return input === '..' || input.startsWith('../') || input.includes('/../');
}

export function normalizeRepoRelativePath(
  filePath: string | null,
  options: LayerRuleResolverOptions = {},
): RepoPathNormalizationResult {
  const raw = filePath?.trim() ?? '';
  if (!raw) {
    return { ok: false, reason: 'empty', normalizedPath: null };
  }

  let relativePath = raw;
  const worktreeRootPath = options.worktreeRootPath?.trim();
  const isAbsolute =
    path.isAbsolute(raw) ||
    path.posix.isAbsolute(toPosixPath(raw)) ||
    looksLikeWindowsAbsolutePath(raw);

  if (isAbsolute) {
    if (!worktreeRootPath) {
      return { ok: false, reason: 'absoluteWithoutRoot', normalizedPath: toPosixPath(raw) };
    }
    const pathModule = looksLikeWindowsAbsolutePath(raw) ? path.win32 : path;
    const rootForModule = looksLikeWindowsAbsolutePath(raw)
      ? worktreeRootPath.replace(/\//g, '\\')
      : worktreeRootPath;
    relativePath = pathModule.relative(pathModule.resolve(rootForModule), pathModule.resolve(raw));
    if (relativePath.startsWith('..') || pathModule.isAbsolute(relativePath)) {
      return {
        ok: false,
        reason: 'outsideRepository',
        normalizedPath: toPosixPath(relativePath),
      };
    }
  } else if (hasDriveLetter(raw)) {
    return { ok: false, reason: 'absoluteWithoutRoot', normalizedPath: toPosixPath(raw) };
  }

  const normalized = path.posix.normalize(stripLeadingSlashes(toPosixPath(relativePath)));
  if (normalized === '.' || !normalized) {
    return { ok: false, reason: 'empty', normalizedPath: null };
  }
  if (isParentTraversal(normalized)) {
    return { ok: false, reason: 'parentTraversal', normalizedPath: normalized };
  }
  return { ok: true, path: normalized };
}

function globSpecificity(pattern: string): GlobSpecificity {
  const literalSegmentCount = pattern
    .split('/')
    .filter((segment) => segment && !/[*?[\]{}()!+@]/.test(segment)).length;
  const wildcardTokenCount = (pattern.match(/(\*\*|\*|\?|\[[^\]]*\]|\{[^}]*\})/g) ?? []).length;
  return {
    literalSegmentCount,
    wildcardTokenCount,
    patternLength: pattern.length,
  };
}

function compareCompiledRules(a: CompiledRule, b: CompiledRule): number {
  return (
    b.rule.priority - a.rule.priority ||
    b.specificity.literalSegmentCount - a.specificity.literalSegmentCount ||
    a.specificity.wildcardTokenCount - b.specificity.wildcardTokenCount ||
    b.specificity.patternLength - a.specificity.patternLength ||
    a.definitionIndex - b.definitionIndex
  );
}

function compilePattern(pattern: string): (input: string) => boolean {
  return picomatch(pattern, {
    dot: true,
    nocase: false,
  });
}

function profileCacheKey(profile: RepositoryLayerProfile): string {
  return `${profile.layerProfileId}:${profile.profileVersion}`;
}

function compileProfile(profile: RepositoryLayerProfile): CompiledProfile {
  const key = profileCacheKey(profile);
  const cached = compiledProfileCache.get(key);
  if (cached) {
    return cached;
  }

  const diagnostics: GraphLayerDiagnostic[] = [];
  const ignoredPatterns: CompiledIgnorePattern[] = [];
  const rules: CompiledRule[] = [];

  profile.ignoredPatterns.forEach((pattern) => {
    if (!pattern.enabled) {
      return;
    }
    try {
      ignoredPatterns.push({
        pattern,
        isMatch: compilePattern(pattern.glob),
      });
    } catch (err) {
      diagnostics.push({
        code: 'LAYER_IGNORE_PATTERN_INVALID_GLOB',
        severity: 'error',
        message: err instanceof Error ? err.message : 'Invalid ignore glob.',
        layerRuleIds: [pattern.ignorePatternId],
      });
    }
  });

  profile.rules.forEach((rule, definitionIndex) => {
    if (!rule.enabled) {
      return;
    }
    if (!rule.layerPath.trim()) {
      diagnostics.push({
        code: 'LAYER_RULE_EMPTY_LAYER_PATH',
        severity: 'error',
        message: 'Layer rule layerPath is empty.',
        layerRuleIds: [rule.layerRuleId],
      });
      return;
    }
    try {
      rules.push({
        rule,
        definitionIndex,
        specificity: globSpecificity(rule.glob),
        isMatch: compilePattern(rule.glob),
      });
    } catch (err) {
      diagnostics.push({
        code: 'LAYER_RULE_INVALID_GLOB',
        severity: 'error',
        message: err instanceof Error ? err.message : 'Invalid layer glob.',
        layerRuleIds: [rule.layerRuleId],
      });
    }
  });

  const compiled = { key, rules, ignoredPatterns, diagnostics };
  compiledProfileCache.set(key, compiled);
  return compiled;
}

export function clearLayerRuleResolverCache(): void {
  compiledProfileCache.clear();
}

export class LayerRuleResolver {
  resolve(
    profile: RepositoryLayerProfile,
    filePath: string | null,
    options: LayerRuleResolverOptions = {},
  ): LayerRuleResolution {
    const normalized = normalizeRepoRelativePath(filePath, options);
    if (!normalized.ok) {
      return {
        filePath: normalized.normalizedPath ?? '',
        status: 'rejected',
        layerRule: null,
        ignoredPattern: null,
        matchedLayerRuleIds: [],
        conflictingLayerRuleIds: [],
        diagnostics: [
          {
            code: 'LAYER_NODE_PATH_REJECTED',
            severity: 'warning',
            message: `Layer path was rejected: ${normalized.reason}.`,
            filePath: normalized.normalizedPath ?? undefined,
          },
        ],
      };
    }

    const compiled = compileProfile(profile);
    const baseDiagnostics = [...compiled.diagnostics];
    const ignoredPattern = compiled.ignoredPatterns.find((pattern) =>
      pattern.isMatch(normalized.path),
    );
    if (ignoredPattern) {
      return {
        filePath: normalized.path,
        status: 'ignored',
        layerRule: null,
        ignoredPattern: ignoredPattern.pattern,
        matchedLayerRuleIds: [],
        conflictingLayerRuleIds: [],
        diagnostics: baseDiagnostics,
      };
    }

    const matchedRules = compiled.rules.filter((rule) => rule.isMatch(normalized.path));
    if (matchedRules.length === 0) {
      return {
        filePath: normalized.path,
        status: 'unmatched',
        layerRule: null,
        ignoredPattern: null,
        matchedLayerRuleIds: [],
        conflictingLayerRuleIds: [],
        diagnostics: baseDiagnostics,
      };
    }

    const [winner, ...conflicts] = matchedRules.sort(compareCompiledRules);
    const conflictingLayerRuleIds = conflicts.map((rule) => rule.rule.layerRuleId);
    const diagnostics = [...baseDiagnostics];
    if (conflictingLayerRuleIds.length > 0) {
      diagnostics.push({
        code: 'LAYER_RULE_CONFLICT',
        severity: 'warning',
        message: 'Multiple layer rules matched; the deterministic winner was selected.',
        filePath: normalized.path,
        layerRuleIds: [winner.rule.layerRuleId, ...conflictingLayerRuleIds],
      });
    }

    return {
      filePath: normalized.path,
      status: 'matched',
      layerRule: winner.rule,
      ignoredPattern: null,
      matchedLayerRuleIds: matchedRules.map((rule) => rule.rule.layerRuleId),
      conflictingLayerRuleIds,
      diagnostics,
    };
  }
}
