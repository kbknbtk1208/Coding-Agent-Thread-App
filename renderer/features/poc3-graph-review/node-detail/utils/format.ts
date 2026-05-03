import type { ReviewProviderKind } from '../../../../../shared/poc3-domain/review-workspace';

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function resolveProviderLabel(providerKind: ReviewProviderKind | undefined): string {
  if (providerKind === 'github') return 'GitHub';
  if (providerKind === 'gitlab') return 'GitLab';
  return 'Provider';
}
