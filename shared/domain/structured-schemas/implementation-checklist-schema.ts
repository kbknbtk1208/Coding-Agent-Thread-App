import {
  IMPLEMENTATION_CHECKLIST_JSON_SCHEMA,
  buildImplementationChecklistPrompt,
  buildStructuredFallbackVerificationPrompt,
  normalizeImplementationChecklist,
  parseImplementationChecklistResponse,
} from '../implementation-checklist';
import type { StructuredSchemaDescriptor } from './types';

export const implementationChecklistSchemaDescriptor: StructuredSchemaDescriptor<'implementation-checklist'> =
  {
    schemaName: 'implementation-checklist',
    jsonSchema: IMPLEMENTATION_CHECKLIST_JSON_SCHEMA,
    buildPrompt: buildImplementationChecklistPrompt,
    buildForcedFallbackPrompt: buildStructuredFallbackVerificationPrompt,
    parseText: parseImplementationChecklistResponse,
    normalize: normalizeImplementationChecklist,
    describeParseFailure(reason, options) {
      switch (reason) {
        case 'emptyResponse':
          return options?.usesOutputSchema
            ? 'Codex の outputSchema 応答が空でした。'
            : 'structured checklist の応答が空でした。';
        case 'schemaValidationFailed':
          return options?.usesOutputSchema
            ? 'Codex の outputSchema 応答は取得できましたが checklist schema に合致しませんでした。'
            : 'JSON は取得できましたが checklist schema に合致しませんでした。';
        case 'jsonParseFailed':
        default:
          return options?.usesOutputSchema
            ? 'Codex の outputSchema 応答を JSON として解釈できませんでした。'
            : 'structured checklist を JSON として解釈できませんでした。';
      }
    },
  };
