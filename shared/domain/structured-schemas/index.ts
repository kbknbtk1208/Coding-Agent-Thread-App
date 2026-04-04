import type { StructuredOutputMode } from '../agent';
import {
  cloneImplementationChecklist,
  summarizeImplementationChecklist,
} from '../implementation-checklist';
import {
  cloneReviewDraftStructuredResult,
  summarizeReviewDraftStructuredResult,
} from '../review-draft';
import { implementationChecklistSchemaDescriptor } from './implementation-checklist-schema';
import { reviewDraftSchemaDescriptor } from './review-draft-schema';
import type {
  StructuredSchemaDescriptor,
  StructuredSchemaMap,
  StructuredSchemaName,
} from './types';

export const STRUCTURED_SCHEMA_REGISTRY = {
  'implementation-checklist': implementationChecklistSchemaDescriptor,
  'review-draft': reviewDraftSchemaDescriptor,
} as const satisfies {
  [K in StructuredSchemaName]: StructuredSchemaDescriptor<K>;
};

export function getStructuredSchemaDescriptor<TName extends StructuredSchemaName>(
  schemaName: TName,
): StructuredSchemaDescriptor<TName> {
  return STRUCTURED_SCHEMA_REGISTRY[schemaName] as StructuredSchemaDescriptor<TName>;
}

export function isStructuredSchemaName(value: unknown): value is StructuredSchemaName {
  return typeof value === 'string' && value in STRUCTURED_SCHEMA_REGISTRY;
}

export function buildStructuredPrompt(
  schemaName: StructuredSchemaName,
  basePrompt: string,
  structuredOutputMode?: StructuredOutputMode,
): string {
  const descriptor = getStructuredSchemaDescriptor(schemaName);
  if (structuredOutputMode === 'forceFallback') {
    return descriptor.buildForcedFallbackPrompt(basePrompt);
  }

  return descriptor.buildPrompt(basePrompt);
}

export function normalizeStructuredResult<TName extends StructuredSchemaName>(
  schemaName: TName,
  value: unknown,
): StructuredSchemaMap[TName] | null {
  return getStructuredSchemaDescriptor(schemaName).normalize(value);
}

export const normalizeStructuredSchemaData = normalizeStructuredResult;

export function cloneStructuredResult<TName extends StructuredSchemaName>(
  schemaName: TName,
  value: StructuredSchemaMap[TName],
): StructuredSchemaMap[TName] {
  if (schemaName === 'implementation-checklist') {
    return cloneImplementationChecklist(
      value as StructuredSchemaMap['implementation-checklist'],
    ) as StructuredSchemaMap[TName];
  }

  return cloneReviewDraftStructuredResult(
    value as StructuredSchemaMap['review-draft'],
  ) as StructuredSchemaMap[TName];
}

export function summarizeStructuredResult<TName extends StructuredSchemaName>(
  schemaName: TName,
  value: StructuredSchemaMap[TName],
): string {
  if (schemaName === 'implementation-checklist') {
    return summarizeImplementationChecklist(
      value as StructuredSchemaMap['implementation-checklist'],
    );
  }

  return summarizeReviewDraftStructuredResult(value as StructuredSchemaMap['review-draft']);
}
