import { describe, expect, it } from 'vitest';
import type { RepositoryLayerProfile } from '../../../shared/poc3-domain/layer-profile';
import { LayerRuleResolver, normalizeRepoRelativePath } from './layer-rule-resolver';

let profileSequence = 0;

function profile(
  rules: RepositoryLayerProfile['rules'],
  ignoredPatterns: RepositoryLayerProfile['ignoredPatterns'] = [],
): RepositoryLayerProfile {
  profileSequence += 1;
  return {
    layerProfileId: `profile-${profileSequence}`,
    repositoryProfileId: 'repo-1',
    repositoryIdentityKey: 'identity-1',
    schemaVersion: 1,
    profileVersion: profileSequence,
    displayName: 'Default',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules,
    ignoredPatterns,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastAppliedAt: null,
  };
}

describe('LayerRuleResolver', () => {
  it('resolves matches by priority, glob specificity, then definition order', () => {
    const resolver = new LayerRuleResolver();
    const byPriority = resolver.resolve(
      profile([
        {
          layerRuleId: 'broad',
          glob: 'renderer/**',
          layerPath: 'frontend',
          displayName: 'Frontend',
          description: null,
          order: 10,
          priority: 1,
          enabled: true,
        },
        {
          layerRuleId: 'specific',
          glob: 'renderer/features/review/**',
          layerPath: 'frontend/review',
          displayName: 'Review',
          description: null,
          order: 20,
          priority: 10,
          enabled: true,
        },
      ]),
      'renderer/features/review/page.tsx',
    );
    expect(byPriority.layerRule?.layerRuleId).toBe('specific');

    const bySpecificity = resolver.resolve(
      profile([
        {
          layerRuleId: 'broad',
          glob: 'renderer/**',
          layerPath: 'frontend',
          displayName: 'Frontend',
          description: null,
          order: 10,
          priority: 1,
          enabled: true,
        },
        {
          layerRuleId: 'specific',
          glob: 'renderer/features/review/**',
          layerPath: 'frontend/review',
          displayName: 'Review',
          description: null,
          order: 20,
          priority: 1,
          enabled: true,
        },
      ]),
      'renderer/features/review/page.tsx',
    );
    expect(bySpecificity.layerRule?.layerRuleId).toBe('specific');

    const byDefinitionOrder = resolver.resolve(
      profile([
        {
          layerRuleId: 'first',
          glob: 'renderer/**',
          layerPath: 'frontend/a',
          displayName: 'First',
          description: null,
          order: 10,
          priority: 1,
          enabled: true,
        },
        {
          layerRuleId: 'second',
          glob: 'renderer/**',
          layerPath: 'frontend/b',
          displayName: 'Second',
          description: null,
          order: 20,
          priority: 1,
          enabled: true,
        },
      ]),
      'renderer/page.tsx',
    );
    expect(byDefinitionOrder.layerRule?.layerRuleId).toBe('first');
  });

  it('returns conflict diagnostics without failing resolution', () => {
    const result = new LayerRuleResolver().resolve(
      profile([
        {
          layerRuleId: 'one',
          glob: 'shared/**',
          layerPath: 'shared',
          displayName: 'Shared',
          description: null,
          order: 10,
          priority: 1,
          enabled: true,
        },
        {
          layerRuleId: 'two',
          glob: 'shared/contracts/**',
          layerPath: 'shared/contracts',
          displayName: 'Contracts',
          description: null,
          order: 20,
          priority: 1,
          enabled: true,
        },
      ]),
      'shared/contracts/api.ts',
    );
    expect(result.status).toBe('matched');
    expect(result.conflictingLayerRuleIds).toEqual(['one']);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code === 'LAYER_RULE_CONFLICT')).toBe(
      true,
    );
  });

  it('evaluates ignore patterns before layer rules', () => {
    const result = new LayerRuleResolver().resolve(
      profile(
        [
          {
            layerRuleId: 'test-rule',
            glob: '**/*.test.ts',
            layerPath: 'test',
            displayName: 'Test',
            description: null,
            order: 30,
            priority: 10,
            enabled: true,
          },
        ],
        [
          {
            ignorePatternId: 'ignore-tests',
            glob: '**/*.test.ts',
            reason: null,
            enabled: true,
          },
        ],
      ),
      'main/foo.test.ts',
    );
    expect(result.status).toBe('ignored');
    expect(result.ignoredPattern?.ignorePatternId).toBe('ignore-tests');
  });

  it('normalizes Windows paths to repo-relative POSIX paths and rejects traversal', () => {
    expect(
      normalizeRepoRelativePath('C:\\repo\\src\\feature.ts', {
        worktreeRootPath: 'C:\\repo',
      }),
    ).toEqual({ ok: true, path: 'src/feature.ts' });
    expect(normalizeRepoRelativePath('src\\feature.ts')).toEqual({
      ok: true,
      path: 'src/feature.ts',
    });
    expect(normalizeRepoRelativePath('../outside.ts').ok).toBe(false);
    expect(normalizeRepoRelativePath('C:\\repo\\src\\feature.ts').ok).toBe(false);
  });

  it('matches dot directories and Japanese paths', () => {
    const result = new LayerRuleResolver().resolve(
      profile([
        {
          layerRuleId: 'jp',
          glob: '.設定/**',
          layerPath: '設定',
          displayName: '設定',
          description: null,
          order: 1,
          priority: 1,
          enabled: true,
        },
      ]),
      '.設定/層.ts',
    );
    expect(result.status).toBe('matched');
    expect(result.layerRule?.layerPath).toBe('設定');
  });
});
