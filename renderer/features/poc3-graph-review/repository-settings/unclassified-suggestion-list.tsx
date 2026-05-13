import { Ban, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type React from 'react';
import type { GraphLayerUnclassifiedDirectory } from '../../../../shared/poc3-domain/layer-profile';

export function UnclassifiedSuggestionList({
  directories,
  defaultLayerPath,
  onAddRule,
  onAddIgnore,
}: {
  directories: GraphLayerUnclassifiedDirectory[];
  defaultLayerPath: string;
  onAddRule: (suggestion: GraphLayerUnclassifiedDirectory, layerPath: string) => void;
  onAddIgnore: (suggestion: GraphLayerUnclassifiedDirectory) => void;
}): React.ReactElement | null {
  const visibleDirectories = useMemo(() => directories.slice(0, 8), [directories]);
  const [layerPathByGlob, setLayerPathByGlob] = useState<Record<string, string>>({});

  if (directories.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-white">Unclassified suggestions</h4>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[minmax(220px,1fr)_96px_96px_minmax(180px,0.8fr)_96px_96px] gap-2 border-b border-white/[0.08] px-3 py-2 text-xs font-medium text-[#8e98a4]">
            <span>directory</span>
            <span>files</span>
            <span>nodes</span>
            <span>layerPath</span>
            <span />
            <span />
          </div>
          {visibleDirectories.map((suggestion) => {
            const layerPath = layerPathByGlob[suggestion.suggestedGlob] ?? defaultLayerPath;
            return (
              <div
                key={suggestion.suggestedGlob}
                className="grid grid-cols-[minmax(220px,1fr)_96px_96px_minmax(180px,0.8fr)_96px_96px] gap-2 border-b border-white/[0.06] px-3 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white" title={suggestion.directoryPath}>
                    {suggestion.directoryPath || suggestion.suggestedGlob}
                  </p>
                  <p className="truncate text-xs text-[#8e98a4]" title={suggestion.suggestedGlob}>
                    {suggestion.suggestedGlob}
                  </p>
                </div>
                <span className="flex h-9 items-center text-sm tabular-nums text-[#d8dde3]">
                  {suggestion.fileCount}
                </span>
                <span className="flex h-9 items-center text-sm tabular-nums text-[#d8dde3]">
                  {suggestion.nodeCount}
                </span>
                <input
                  value={layerPath}
                  onChange={(event) =>
                    setLayerPathByGlob((current) => ({
                      ...current,
                      [suggestion.suggestedGlob]: event.target.value,
                    }))
                  }
                  className="h-9 min-w-0 rounded-lg border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45"
                  placeholder="frontend"
                  aria-label={`${suggestion.suggestedGlob} layer path`}
                />
                <button
                  type="button"
                  disabled={!layerPath.trim()}
                  onClick={() => onAddRule(suggestion, layerPath)}
                  className="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/[0.12] px-2 text-sm text-white transition hover:border-[#d8e071]/35 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Rule
                </button>
                <button
                  type="button"
                  onClick={() => onAddIgnore(suggestion)}
                  className="flex h-9 cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/[0.12] px-2 text-sm text-white transition hover:border-[#ffbc6e]/45"
                >
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Ignore
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
