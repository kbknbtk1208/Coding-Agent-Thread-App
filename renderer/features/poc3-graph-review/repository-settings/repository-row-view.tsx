import { Pencil } from 'lucide-react';
import type React from 'react';
import type { PublicRepositoryProvider } from '../../../../shared/poc3-domain/repository';
import { IconButton } from './_shared/forms';
import type { ProfileDraft } from './repository-draft-helpers';
import { providerOptionLabel, repositoryDisplayName } from './repository-draft-helpers';

export function RepositoryRowView(props: {
  draft: ProfileDraft;
  providerById: Map<string, PublicRepositoryProvider>;
  onChange: (draftId: string, patch: Partial<ProfileDraft>) => void;
}): React.ReactElement {
  const { draft, providerById, onChange } = props;
  const selectedProvider = providerById.get(draft.repositoryProviderId);

  return (
    <div className="grid items-center gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="break-all text-sm font-medium text-white">
          {repositoryDisplayName(draft.originUrl)}
        </p>
        <p className="mt-1 text-xs text-[#8e98a4]">
          {selectedProvider ? providerOptionLabel(selectedProvider) : 'Provider 未解決'}
        </p>
      </div>
      <IconButton
        label="Edit repository"
        onClick={() =>
          onChange(draft.draftId, {
            isEditing: true,
            showSetupScript: Boolean(draft.setupScriptText.trim()),
            error: null,
            message: null,
          })
        }
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </IconButton>
    </div>
  );
}
