import type { ImplementationChecklist } from '../implementation-checklist';
import type { ReviewDraftStructuredResult } from '../review-draft';

export type StructuredSchemaParseFailureReason =
  | 'emptyResponse'
  | 'jsonParseFailed'
  | 'schemaValidationFailed';

export type StructuredSchemaParseResult<TValue> =
  | {
      ok: true;
      value: TValue;
    }
  | {
      ok: false;
      reason: StructuredSchemaParseFailureReason;
    };

export interface StructuredSchemaMap {
  'implementation-checklist': ImplementationChecklist;
  'review-draft': ReviewDraftStructuredResult;
}

export type StructuredSchemaName = keyof StructuredSchemaMap;

export interface StructuredSchemaDescriptor<TName extends StructuredSchemaName> {
  schemaName: TName;
  jsonSchema: Record<string, unknown>;
  buildPrompt(prompt: string): string;
  buildForcedFallbackPrompt(prompt: string): string;
  parseText(text: string): StructuredSchemaParseResult<StructuredSchemaMap[TName]>;
  normalize(value: unknown): StructuredSchemaMap[TName] | null;
  describeParseFailure(
    reason: StructuredSchemaParseFailureReason,
    options?: { usesOutputSchema?: boolean },
  ): string;
}
