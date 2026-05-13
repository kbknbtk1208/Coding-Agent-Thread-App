'use client';

import { AlertTriangle, Layers, Layers2 } from 'lucide-react';
import type { GraphLayerRenderSnapshot } from '../../../../shared/poc3-domain/layer-profile';

export interface LayerStatusStripProps {
  layers: GraphLayerRenderSnapshot | null | undefined;
  enabled: boolean;
  warningMessage?: string | null;
  onToggleEnabled: (enabled: boolean) => void;
  onOpenLayerSettings?: () => void;
}

export function LayerStatusStrip({
  layers,
  enabled,
  warningMessage,
  onToggleEnabled,
  onOpenLayerSettings,
}: LayerStatusStripProps) {
  const unclassifiedCount = layers?.unclassifiedSummary.nodeCount ?? 0;
  const violationCount = layers?.violationEdgeIds.length ?? 0;
  const diagnostics = layers?.diagnostics ?? [];
  const compactWarning =
    warningMessage ??
    diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
    diagnostics.find((diagnostic) => diagnostic.severity === 'warning')?.message ??
    null;
  const hasLayerProfile = layers != null;

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        className={`pointer-events-auto inline-flex h-8 cursor-pointer items-center gap-2 rounded-[7px] border px-2.5 text-[12px] font-semibold backdrop-blur-[12px] ${
          enabled
            ? 'border-[#58d7ff]/25 bg-[#06131a]/88 text-[#dff7ff]'
            : 'border-white/[0.1] bg-[#111]/82 text-white/55'
        }`}
        onClick={() => onToggleEnabled(!enabled)}
        title={enabled ? 'Layer 表示をオフ' : 'Layer 表示をオン'}
      >
        {enabled ? (
          <Layers2 className="size-3.5" aria-hidden="true" />
        ) : (
          <Layers className="size-3.5" aria-hidden="true" />
        )}
        Layers
      </button>
      {enabled && hasLayerProfile ? (
        <>
          <button
            type="button"
            disabled={unclassifiedCount === 0 || !onOpenLayerSettings}
            onClick={onOpenLayerSettings}
            className="pointer-events-auto rounded-[7px] border border-white/[0.1] bg-[#111]/78 px-2.5 py-1.5 text-[12px] font-medium text-white/62 backdrop-blur-[12px] enabled:cursor-pointer enabled:hover:border-[#d8e071]/35 enabled:hover:text-white disabled:cursor-default"
            title={unclassifiedCount > 0 ? 'Repository Settings の Layers を開く' : undefined}
          >
            未分類 {unclassifiedCount}
          </button>
          <span
            className={`rounded-[7px] border px-2.5 py-1.5 text-[12px] font-medium backdrop-blur-[12px] ${
              violationCount > 0
                ? 'border-[#ff8a4c]/35 bg-[#221008]/82 text-[#ffb28a]'
                : 'border-white/[0.1] bg-[#111]/78 text-white/62'
            }`}
          >
            reverse {violationCount}
          </span>
          {layers.status !== 'ready' ? (
            <span className="rounded-[7px] border border-[#d8e071]/24 bg-[#191a08]/82 px-2.5 py-1.5 text-[12px] font-medium text-[#eef59a] backdrop-blur-[12px]">
              {layers.status}
            </span>
          ) : null}
        </>
      ) : null}
      {compactWarning ? (
        <span
          className="flex min-w-0 max-w-[520px] items-center gap-1.5 rounded-[7px] border border-[#ff8a4c]/28 bg-[#211008]/86 px-2.5 py-1.5 text-[12px] font-medium text-[#ffb28a] backdrop-blur-[12px]"
          title={compactWarning}
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{compactWarning}</span>
        </span>
      ) : null}
    </div>
  );
}
