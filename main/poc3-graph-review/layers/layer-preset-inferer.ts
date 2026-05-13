import fs from 'fs';
import path from 'path';
import type { RepositoryProfile } from '../../../shared/poc3-domain/repository';
import type {
  GraphLayerDiagnostic,
  RepositoryLayerProfile,
  RepositoryLayerProfileDraft,
  RepositoryLayerRuleDraft,
} from '../../../shared/poc3-domain/layer-profile';
import type { LayerProfileStore } from './layer-profile-store';
import { buildRepositoryIdentityKey } from './repository-identity';

export interface InferredRepositoryLayerProfileDraft {
  source: 'same-repository-copy' | 'heuristic' | 'empty';
  draft: RepositoryLayerProfileDraft;
  diagnostics: GraphLayerDiagnostic[];
}

function emptyDraft(repositoryProfile: RepositoryProfile): RepositoryLayerProfileDraft {
  return {
    repositoryProfileId: repositoryProfile.repositoryProfileId,
    repositoryIdentityKey: buildRepositoryIdentityKey(repositoryProfile),
    schemaVersion: 1,
    displayName: 'Repository layers',
    layoutDirection: 'RIGHT',
    dependencyDirection: 'order-ascending',
    layoutStrategy: 'lane-composition',
    rules: [],
    ignoredPatterns: [],
  };
}

function draftFromProfile(
  source: RepositoryLayerProfile,
  repositoryProfile: RepositoryProfile,
): RepositoryLayerProfileDraft {
  return {
    ...emptyDraft(repositoryProfile),
    displayName: source.displayName,
    layoutDirection: source.layoutDirection,
    dependencyDirection: source.dependencyDirection,
    layoutStrategy: source.layoutStrategy,
    rules: source.rules.map(({ layerRuleId: _layerRuleId, ...rule }) => ({ ...rule })),
    ignoredPatterns: source.ignoredPatterns.map(
      ({ ignorePatternId: _ignorePatternId, ...pattern }) => ({ ...pattern }),
    ),
  };
}

function pathExists(root: string, relativePath: string): boolean {
  try {
    return fs.existsSync(path.join(root, relativePath));
  } catch {
    return false;
  }
}

function addRule(
  rules: RepositoryLayerRuleDraft[],
  input: Omit<RepositoryLayerRuleDraft, 'description' | 'enabled'> &
    Partial<Pick<RepositoryLayerRuleDraft, 'description' | 'enabled'>>,
): void {
  if (rules.some((rule) => rule.glob === input.glob && rule.layerPath === input.layerPath)) {
    return;
  }
  rules.push({
    ...input,
    description: input.description ?? null,
    enabled: input.enabled ?? true,
  });
}

function heuristicRules(repositoryProfile: RepositoryProfile): RepositoryLayerRuleDraft[] {
  const root = repositoryProfile.worktreeRootPath || repositoryProfile.localClonePath;
  const rules: RepositoryLayerRuleDraft[] = [];

  if (pathExists(root, 'renderer')) {
    addRule(rules, {
      glob: 'renderer/**',
      layerPath: 'frontend',
      displayName: 'frontend',
      order: 100,
      priority: 10,
    });
    addRule(rules, {
      glob: 'renderer/**/components/**',
      layerPath: 'frontend/component',
      displayName: 'component',
      order: 110,
      priority: 30,
    });
    addRule(rules, {
      glob: 'renderer/**/hooks/**',
      layerPath: 'frontend/hook',
      displayName: 'hook',
      order: 120,
      priority: 30,
    });
    addRule(rules, {
      glob: 'renderer/**/services/**',
      layerPath: 'frontend/service',
      displayName: 'service',
      order: 130,
      priority: 30,
    });
  }

  if (pathExists(root, 'main')) {
    addRule(rules, {
      glob: 'main/**',
      layerPath: 'backend',
      displayName: 'backend',
      order: 200,
      priority: 10,
    });
    addRule(rules, {
      glob: 'main/**/source/**',
      layerPath: 'backend/source',
      displayName: 'source',
      order: 210,
      priority: 30,
    });
    addRule(rules, {
      glob: 'main/**/agent/**',
      layerPath: 'backend/application',
      displayName: 'application',
      order: 220,
      priority: 30,
    });
    addRule(rules, {
      glob: 'main/**/store/**',
      layerPath: 'backend/infra',
      displayName: 'infra',
      order: 240,
      priority: 30,
    });
  }

  if (pathExists(root, 'shared')) {
    addRule(rules, {
      glob: 'shared/**',
      layerPath: 'shared',
      displayName: 'shared',
      order: 300,
      priority: 10,
    });
    addRule(rules, {
      glob: 'shared/**/contracts/**',
      layerPath: 'shared/contract',
      displayName: 'contract',
      order: 310,
      priority: 30,
    });
    addRule(rules, {
      glob: 'shared/**/domain/**',
      layerPath: 'shared/domain',
      displayName: 'domain',
      order: 320,
      priority: 30,
    });
  }

  return rules;
}

export class LayerPresetInferer {
  constructor(private readonly layerProfileStore: LayerProfileStore) {}

  infer(repositoryProfile: RepositoryProfile): InferredRepositoryLayerProfileDraft {
    const reusableProfile =
      this.layerProfileStore.findLatestReusableProfileForRepository(repositoryProfile);
    if (reusableProfile) {
      return {
        source: 'same-repository-copy',
        draft: draftFromProfile(reusableProfile, repositoryProfile),
        diagnostics: [],
      };
    }

    const rules = heuristicRules(repositoryProfile);
    if (rules.length > 0) {
      return {
        source: 'heuristic',
        draft: {
          ...emptyDraft(repositoryProfile),
          rules,
        },
        diagnostics: [],
      };
    }

    return {
      source: 'empty',
      draft: emptyDraft(repositoryProfile),
      diagnostics: [
        {
          code: 'LAYER_PRESET_EMPTY',
          severity: 'info',
          message: 'No repository layer preset was inferred.',
        },
      ],
    };
  }
}
