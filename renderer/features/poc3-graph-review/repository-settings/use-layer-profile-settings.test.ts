import { describe, expect, it } from 'vitest';
import type { RepositoryLayerProfile } from '../../../../shared/poc3-domain/layer-profile';
import {
  createEmptyLayerProfileDraft,
  createIgnorePatternDraft,
  createLayerProfileDraftSignature,
  createLayerRuleDraft,
  firstAvailableLayerPath,
  layerProfileToDraft,
  resolveSelectedRepositoryProfileId,
} from './use-layer-profile-settings';

describe('layer profile draft helpers', () => {
  it('creates an exportable empty draft for a repository profile', () => {
    expect(createEmptyLayerProfileDraft('repo-1')).toMatchObject({
      repositoryProfileId: 'repo-1',
      schemaVersion: 1,
      layoutDirection: 'RIGHT',
      dependencyDirection: 'order-ascending',
      layoutStrategy: 'lane-composition',
      rules: [],
      ignoredPatterns: [],
    });
  });

  it('keeps order and priority as separate rule fields', () => {
    const rule = createLayerRuleDraft([], {
      glob: 'renderer/**',
      layerPath: 'frontend',
      order: 20,
      priority: 5,
    });

    expect(rule.order).toBe(20);
    expect(rule.priority).toBe(5);
  });

  it('increments default rule order without changing default priority', () => {
    const existing = [
      createLayerRuleDraft([], { glob: 'main/**', layerPath: 'backend', order: 30 }),
    ];
    const rule = createLayerRuleDraft(existing, { glob: 'shared/**', layerPath: 'shared' });

    expect(rule.order).toBe(40);
    expect(rule.priority).toBe(0);
  });

  it('creates enabled ignore pattern drafts', () => {
    expect(createIgnorePatternDraft({ glob: '**/fixtures/**' })).toMatchObject({
      glob: '**/fixtures/**',
      reason: null,
      enabled: true,
    });
  });

  it('converts stored profiles to editable drafts without mutating stored arrays', () => {
    const profile: RepositoryLayerProfile = {
      layerProfileId: 'layer-profile-1',
      repositoryProfileId: 'repo-1',
      repositoryIdentityKey: 'identity',
      schemaVersion: 1,
      profileVersion: 3,
      displayName: 'Layers',
      layoutDirection: 'RIGHT',
      dependencyDirection: 'order-ascending',
      layoutStrategy: 'lane-composition',
      rules: [
        {
          layerRuleId: 'rule-1',
          glob: 'renderer/**',
          layerPath: 'frontend',
          displayName: 'frontend',
          description: null,
          order: 10,
          priority: 1,
          enabled: true,
        },
      ],
      ignoredPatterns: [
        {
          ignorePatternId: 'ignore-1',
          glob: '**/fixtures/**',
          reason: 'fixtures',
          enabled: true,
        },
      ],
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
      lastAppliedAt: null,
    };

    const draft = layerProfileToDraft(profile);
    draft.rules[0].glob = 'main/**';
    draft.ignoredPatterns[0].glob = '**/dist/**';

    expect(profile.rules[0].glob).toBe('renderer/**');
    expect(profile.ignoredPatterns[0].glob).toBe('**/fixtures/**');
  });

  it('returns the first enabled layer path for suggestions', () => {
    expect(
      firstAvailableLayerPath({
        ...createEmptyLayerProfileDraft('repo-1'),
        rules: [
          createLayerRuleDraft([], { layerPath: 'disabled', enabled: false }),
          createLayerRuleDraft([], { layerPath: 'frontend/component', enabled: true }),
        ],
      }),
    ).toBe('frontend/component');
  });

  it('changes draft signatures when async preview or save inputs become stale', () => {
    const draft = createEmptyLayerProfileDraft('repo-1');
    const firstSignature = createLayerProfileDraftSignature(draft);
    const nextSignature = createLayerProfileDraftSignature({
      ...draft,
      rules: [createLayerRuleDraft([], { glob: 'main/**', layerPath: 'backend' })],
    });

    expect(firstSignature).not.toBe(nextSignature);
  });

  it('prefers the workspace repository profile when opening layers from a workspace', () => {
    expect(
      resolveSelectedRepositoryProfileId({
        repositoryProfileIds: ['repo-a', 'repo-b'],
        selectedRepositoryProfileId: '',
        initialRepositoryProfileId: 'repo-b',
      }),
    ).toBe('repo-b');
  });
});
