import { Plus, Trash2 } from 'lucide-react';
import type React from 'react';
import type {
  RepositoryLayerIgnorePatternDraft,
  RepositoryLayerRuleDraft,
} from '../../../../shared/poc3-domain/layer-profile';

const inputClass =
  'h-9 min-w-0 rounded-lg border border-white/[0.12] bg-black/30 px-2 text-sm text-white outline-none transition placeholder:text-[#68717b] focus:border-[#d8e071]/45';

const numberInputClass = `${inputClass} text-right tabular-nums`;

export function LayerRuleList({
  rules,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rules: RepositoryLayerRuleDraft[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<RepositoryLayerRuleDraft>) => void;
  onRemove: (index: number) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Rules</h4>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Rule
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <div className="min-w-[920px]">
          <div className="grid grid-cols-[52px_minmax(220px,1.4fr)_minmax(180px,0.95fr)_minmax(160px,0.75fr)_86px_92px_48px] gap-2 border-b border-white/[0.08] px-3 py-2 text-xs font-medium text-[#8e98a4]">
            <span>on</span>
            <span>glob</span>
            <span>layerPath</span>
            <span>displayName</span>
            <span>order</span>
            <span>priority</span>
            <span />
          </div>
          {rules.length > 0 ? (
            rules.map((rule, index) => (
              <div
                key={rule.layerRuleId ?? `new-rule-${index}`}
                className="grid grid-cols-[52px_minmax(220px,1.4fr)_minmax(180px,0.95fr)_minmax(160px,0.75fr)_86px_92px_48px] gap-2 border-b border-white/[0.06] px-3 py-2 last:border-b-0"
              >
                <label className="flex h-9 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => onUpdate(index, { enabled: event.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-[#d8e071]"
                    aria-label={`Rule ${index + 1} enabled`}
                  />
                </label>
                <input
                  value={rule.glob}
                  onChange={(event) => onUpdate(index, { glob: event.target.value })}
                  className={inputClass}
                  placeholder="renderer/**"
                  aria-label={`Rule ${index + 1} glob`}
                />
                <input
                  value={rule.layerPath}
                  onChange={(event) => onUpdate(index, { layerPath: event.target.value })}
                  className={inputClass}
                  placeholder="frontend/component"
                  aria-label={`Rule ${index + 1} layer path`}
                />
                <input
                  value={rule.displayName}
                  onChange={(event) => onUpdate(index, { displayName: event.target.value })}
                  className={inputClass}
                  placeholder="component"
                  aria-label={`Rule ${index + 1} display name`}
                />
                <input
                  value={String(rule.order)}
                  type="number"
                  onChange={(event) => onUpdate(index, { order: Number(event.target.value) })}
                  className={numberInputClass}
                  aria-label={`Rule ${index + 1} lane order`}
                />
                <input
                  value={String(rule.priority)}
                  type="number"
                  onChange={(event) => onUpdate(index, { priority: Number(event.target.value) })}
                  className={numberInputClass}
                  aria-label={`Rule ${index + 1} match priority`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/[0.12] text-[#ffb4b4] transition hover:border-[#ff8a8a]/50"
                  aria-label={`Delete rule ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-[#a8b0b8]">No rules</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function IgnorePatternList({
  patterns,
  onAdd,
  onUpdate,
  onRemove,
}: {
  patterns: RepositoryLayerIgnorePatternDraft[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<RepositoryLayerIgnorePatternDraft>) => void;
  onRemove: (index: number) => void;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-white">Ignore</h4>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.12] px-3 text-sm text-white transition hover:border-[#d8e071]/35"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Pattern
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[52px_minmax(240px,1fr)_minmax(180px,0.7fr)_48px] gap-2 border-b border-white/[0.08] px-3 py-2 text-xs font-medium text-[#8e98a4]">
            <span>on</span>
            <span>glob</span>
            <span>reason</span>
            <span />
          </div>
          {patterns.length > 0 ? (
            patterns.map((pattern, index) => (
              <div
                key={pattern.ignorePatternId ?? `new-ignore-${index}`}
                className="grid grid-cols-[52px_minmax(240px,1fr)_minmax(180px,0.7fr)_48px] gap-2 border-b border-white/[0.06] px-3 py-2 last:border-b-0"
              >
                <label className="flex h-9 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={pattern.enabled}
                    onChange={(event) => onUpdate(index, { enabled: event.target.checked })}
                    className="h-4 w-4 cursor-pointer accent-[#d8e071]"
                    aria-label={`Ignore pattern ${index + 1} enabled`}
                  />
                </label>
                <input
                  value={pattern.glob}
                  onChange={(event) => onUpdate(index, { glob: event.target.value })}
                  className={inputClass}
                  placeholder="**/fixtures/**"
                  aria-label={`Ignore pattern ${index + 1} glob`}
                />
                <input
                  value={pattern.reason ?? ''}
                  onChange={(event) => onUpdate(index, { reason: event.target.value || null })}
                  className={inputClass}
                  placeholder="optional"
                  aria-label={`Ignore pattern ${index + 1} reason`}
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-white/[0.12] text-[#ffb4b4] transition hover:border-[#ff8a8a]/50"
                  aria-label={`Delete ignore pattern ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <p className="px-3 py-4 text-sm text-[#a8b0b8]">No ignore patterns</p>
          )}
        </div>
      </div>
    </div>
  );
}
