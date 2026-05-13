import { RefreshCw, RotateCcw, Save } from 'lucide-react';
import type React from 'react';
import type { GraphLayerDiagnostic } from '../../../../shared/poc3-domain/layer-profile';
import { Message, SectionTitle } from './_shared/forms';
import { IgnorePatternList, LayerRuleList } from './layer-rule-list';
import { FEY_GLASS_CARD_CLASS, type ProfileDraft } from './repository-draft-helpers';
import { UnclassifiedSuggestionList } from './unclassified-suggestion-list';
import { firstAvailableLayerPath, useLayerProfileSettings } from './use-layer-profile-settings';

export function LayersSection({
  profiles,
  reviewWorkspaceId,
  initialRepositoryProfileId,
}: {
  profiles: ProfileDraft[];
  reviewWorkspaceId: string | null;
  initialRepositoryProfileId?: string | null;
}): React.ReactElement {
  const savedProfiles = profiles.filter((profile) => profile.repositoryProfileId);
  const layerSettings = useLayerProfileSettings({
    repositoryProfileIds: savedProfiles
      .map((profile) => profile.repositoryProfileId)
      .filter((id): id is string => Boolean(id)),
    initialRepositoryProfileId,
    reviewWorkspaceId,
  });
  const selectedProfile = savedProfiles.find(
    (profile) => profile.repositoryProfileId === layerSettings.selectedRepositoryProfileId,
  );
  const draft = layerSettings.draft;
  const defaultLayerPath = firstAvailableLayerPath(draft);

  return (
    <section className="space-y-3" data-repository-settings-section="layers">
      <SectionTitle title="Layers" />
      {savedProfiles.length === 0 ? (
        <Message tone="info">
          Repository Profile を保存すると layer profile を編集できます。
        </Message>
      ) : (
        <div className={`${FEY_GLASS_CARD_CLASS} space-y-4 p-4`}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-[240px] flex-1">
              <label className="text-xs font-medium text-[#8e98a4]" htmlFor="layer-profile-target">
                Repository
              </label>
              <select
                id="layer-profile-target"
                value={layerSettings.selectedRepositoryProfileId}
                onChange={(event) =>
                  layerSettings.setSelectedRepositoryProfileId(event.target.value)
                }
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition focus:border-[#d8e071]/45"
              >
                {savedProfiles.map((profile) => (
                  <option
                    key={profile.repositoryProfileId}
                    value={profile.repositoryProfileId}
                    className="bg-[#151515]"
                  >
                    {profile.originUrl || profile.localClonePath}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={layerSettings.loading || layerSettings.busy}
                onClick={layerSettings.inferDraft}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#479ffa]/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Infer
              </button>
              <button
                type="button"
                disabled={!layerSettings.canPreview || layerSettings.loading || layerSettings.busy}
                onClick={layerSettings.preview}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Preview
              </button>
              <button
                type="button"
                disabled={!draft || layerSettings.loading || layerSettings.busy}
                onClick={layerSettings.save}
                className="flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-[#d8e071] px-3 text-sm font-semibold text-black transition hover:bg-[#eef49a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                Save
              </button>
            </div>
          </div>

          {layerSettings.error ? <Message tone="error">{layerSettings.error}</Message> : null}
          {layerSettings.message ? <Message tone="info">{layerSettings.message}</Message> : null}

          {draft ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.7fr)_minmax(220px,0.7fr)_minmax(180px,0.6fr)]">
                <div>
                  <label
                    className="text-xs font-medium text-[#8e98a4]"
                    htmlFor="layer-profile-name"
                  >
                    displayName
                  </label>
                  <input
                    id="layer-profile-name"
                    value={draft.displayName}
                    onChange={(event) =>
                      layerSettings.updateProfile({ displayName: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-white/[0.12] bg-black/30 px-3 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
                    placeholder="Repository layers"
                  />
                </div>
                <ReadOnlyField label="source" value={layerSettings.source ?? 'loading'} />
                <ReadOnlyField
                  label="selected"
                  value={selectedProfile?.originUrl || selectedProfile?.localClonePath || '-'}
                />
              </div>

              <LayerRuleList
                rules={draft.rules}
                onAdd={() => layerSettings.addRule()}
                onUpdate={layerSettings.updateRule}
                onRemove={layerSettings.removeRule}
              />
              <IgnorePatternList
                patterns={draft.ignoredPatterns}
                onAdd={() => layerSettings.addIgnorePattern()}
                onUpdate={layerSettings.updateIgnorePattern}
                onRemove={layerSettings.removeIgnorePattern}
              />
              <PreviewPanel
                summary={layerSettings.previewSummary}
                diagnostics={[...layerSettings.diagnostics, ...layerSettings.previewDiagnostics]}
                violationCount={layerSettings.violationEdgeIds.length}
                previewAvailable={Boolean(reviewWorkspaceId)}
              />
              <UnclassifiedSuggestionList
                directories={layerSettings.previewSummary?.directories ?? []}
                defaultLayerPath={defaultLayerPath}
                onAddRule={layerSettings.addRuleFromSuggestion}
                onAddIgnore={layerSettings.addIgnoreFromSuggestion}
              />
            </>
          ) : (
            <p className="text-sm text-[#a8b0b8]">
              {layerSettings.loading ? 'Loading layer profile...' : 'No layer profile'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="min-w-0">
      <span className="text-xs font-medium text-[#8e98a4]">{label}</span>
      <p className="mt-1 flex h-10 items-center truncate text-sm text-white" title={value}>
        {value}
      </p>
    </div>
  );
}

function PreviewPanel({
  summary,
  diagnostics,
  violationCount,
  previewAvailable,
}: {
  summary: { nodeCount: number; fileCount: number } | null;
  diagnostics: GraphLayerDiagnostic[];
  violationCount: number;
  previewAvailable: boolean;
}): React.ReactElement {
  const errorCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warningCount = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const visibleDiagnostics = diagnostics.slice(0, 6);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-white">Preview</h4>
      {!previewAvailable ? (
        <p className="text-sm text-[#a8b0b8]">Workspace 選択中のみ preview できます。</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-4">
        <Metric label="unclassified nodes" value={summary?.nodeCount ?? 0} />
        <Metric label="unclassified files" value={summary?.fileCount ?? 0} />
        <Metric label="violations" value={violationCount} />
        <Metric label="issues" value={errorCount + warningCount} />
      </div>
      {visibleDiagnostics.length > 0 ? (
        <div className="rounded-xl border border-white/[0.08]">
          {visibleDiagnostics.map((diagnostic, index) => (
            <div
              key={`${diagnostic.code}-${index}`}
              className="grid grid-cols-[88px_minmax(0,1fr)] gap-2 border-b border-white/[0.06] px-3 py-2 text-sm last:border-b-0"
            >
              <span
                className={
                  diagnostic.severity === 'error'
                    ? 'text-[#ffb4b4]'
                    : diagnostic.severity === 'warning'
                      ? 'text-[#ffcf8a]'
                      : 'text-[#a8b0b8]'
                }
              >
                {diagnostic.severity}
              </span>
              <span className="min-w-0 truncate text-[#d8dde3]" title={diagnostic.message}>
                {diagnostic.message}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="border-l border-white/[0.12] px-3 py-1">
      <p className="text-xs text-[#8e98a4]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
