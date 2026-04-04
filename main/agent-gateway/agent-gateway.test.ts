import { describe, expect, it, vi } from 'vitest';
import { AgentGateway } from './agent-gateway';
import type {
  CreateRuntimeSessionInput,
  RuntimeSessionHandle,
} from '../agent-runtime/shared/runtime-contracts';

describe('AgentGateway', () => {
  it('waits for finalResult when completed status arrives before result events', async () => {
    const gateway = new AgentGateway(() => {});
    const createSession = vi.fn(
      async (input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> => {
        return {
          agent: 'codex',
          capabilities: ['structuredOutput'],
          providerSessionId: 'provider-session-1',
          async sendPrompt() {
            input.emit({ type: 'status.changed', status: 'running' });
            input.emit({ type: 'status.changed', status: 'completed' });

            await new Promise((resolve) => setTimeout(resolve, 0));

            input.emit({
              type: 'result.structured',
              schemaName: 'review-draft',
              source: 'codexOutputSchema',
              fallbackRichText: '{"type":"review-draft"}',
              data: {
                findings: [],
                summary: {
                  headline: 'headline',
                  overview: 'overview',
                  positives: [],
                  risks: [],
                },
                type: 'review-draft',
              } as any,
            });
          },
          async dispose() {},
        };
      },
    );

    (gateway as any).runtimes.codex = {
      agent: 'codex',
      createSession,
    };

    const started = await gateway.startSession({
      agent: 'codex',
      cwd: 'C:/workspace',
      prompt: 'レビューしてください',
      responseMode: 'structured',
      structuredSchemaName: 'review-draft',
    });

    const settled = await gateway.awaitSettled(started.appSessionId);

    expect(createSession).toHaveBeenCalled();
    if (settled.finalResult?.kind !== 'structured') {
      throw new Error('finalResult が structured ではありません。');
    }
    expect(settled.finalResult.schemaName).toBe('review-draft');
  });

  it('preserves runtime error details on the settled session snapshot', async () => {
    const gateway = new AgentGateway(() => {});
    const createSession = vi.fn(
      async (input: CreateRuntimeSessionInput): Promise<RuntimeSessionHandle> => {
        return {
          agent: 'codex',
          capabilities: ['structuredOutput'],
          providerSessionId: 'provider-session-2',
          async sendPrompt() {
            input.emit({ type: 'status.changed', status: 'running' });
            input.emit({
              type: 'error',
              error: {
                code: 'CODEX_TURN_FAILED',
                message:
                  'Codex turn failed: invalid_json_schema (location.oneOf is not permitted).',
                retryable: false,
              },
            });
          },
          async dispose() {},
        };
      },
    );

    (gateway as any).runtimes.codex = {
      agent: 'codex',
      createSession,
    };

    const started = await gateway.startSession({
      agent: 'codex',
      cwd: 'C:/workspace',
      prompt: 'レビューしてください',
      responseMode: 'structured',
      structuredSchemaName: 'review-draft',
    });

    const settled = await gateway.awaitSettled(started.appSessionId);

    expect(settled.status).toBe('failed');
    expect(settled.lastError).toEqual({
      code: 'CODEX_TURN_FAILED',
      message: 'Codex turn failed: invalid_json_schema (location.oneOf is not permitted).',
      retryable: false,
    });
  });
});
