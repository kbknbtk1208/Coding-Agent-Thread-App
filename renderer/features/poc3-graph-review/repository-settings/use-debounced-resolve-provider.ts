import { useEffect } from 'react';
import { POC3_MOTION_TIMEOUT_MS } from '../components/motion-timing';

export interface ResolveProviderRequest {
  draftId: string;
  originUrl: string;
}

export function resolveProviderOriginForDebounce(params: {
  originUrl: string;
  isEditing: boolean;
}): string | null {
  const trimmedOriginUrl = params.originUrl.trim();
  return params.isEditing && trimmedOriginUrl ? trimmedOriginUrl : null;
}

export function useDebouncedResolveProvider(params: {
  draftId: string;
  originUrl: string;
  isEditing: boolean;
  delayMs?: number;
  onResolve: (request: ResolveProviderRequest) => void;
}): void {
  const { draftId, originUrl, isEditing, delayMs, onResolve } = params;

  useEffect(() => {
    const trimmedOriginUrl = resolveProviderOriginForDebounce({ originUrl, isEditing });
    if (!trimmedOriginUrl) {
      return;
    }
    const timerId = window.setTimeout(
      () => onResolve({ draftId, originUrl: trimmedOriginUrl }),
      delayMs ?? POC3_MOTION_TIMEOUT_MS.repositoryProviderResolve,
    );
    return () => window.clearTimeout(timerId);
  }, [draftId, originUrl, isEditing, delayMs, onResolve]);
}
