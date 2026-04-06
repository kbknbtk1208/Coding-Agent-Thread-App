import { describe, expect, it, vi } from 'vitest';
import type { AppSession } from '../../shared/domain/agent';
import type { ReviewSourceDraft } from '../../shared/domain/review';
import type { ReviewDraftEnvelope, ReviewRunRecord } from '../../shared/domain/review-draft';
import { ReviewDraftStore } from './review-draft-store';
import { ReviewGateway } from './review-gateway';

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/plain',
      ...init.headers,
    },
  });
}

describe('ReviewGateway', () => {
  it('loads a GitHub source, hydrates the first file, and can hydrate another file later', async () => {
    const originalToken = process.env.REVIEW_GITHUB_TOKEN;
    process.env.REVIEW_GITHUB_TOKEN = 'token';

    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));

      if (url.pathname === '/repos/octocat/hello-world/pulls/1') {
        return jsonResponse({
          number: 1,
          title: 'Example pull request',
          body: 'Example description',
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' },
        });
      }

      if (url.pathname === '/repos/octocat/hello-world/pulls/1/files') {
        return jsonResponse([
          {
            sha: 'file-1',
            filename: 'src/utils/format.ts',
            status: 'modified',
            additions: 1,
            deletions: 1,
            changes: 2,
            patch: '@@ -1 +1 @@',
            contents_url:
              'https://api.github.com/repos/octocat/hello-world/contents/src/utils/format.ts',
            blob_url: '',
            raw_url: '',
          },
          {
            sha: 'file-2',
            filename: 'src/components/Header.tsx',
            status: 'added',
            additions: 1,
            deletions: 0,
            changes: 1,
            patch: '@@ -0,0 +1 @@',
            contents_url:
              'https://api.github.com/repos/octocat/hello-world/contents/src/components/Header.tsx',
            blob_url: '',
            raw_url: '',
          },
        ]);
      }

      if (url.pathname === '/repos/octocat/hello-world/pulls/1/comments') {
        return jsonResponse([
          {
            id: 11,
            body: 'Nice change.',
            path: 'src/utils/format.ts',
            line: 2,
            side: 'RIGHT',
            start_line: null,
            start_side: null,
            user: { login: 'reviewer' },
            created_at: '2025-05-01T10:00:00Z',
            updated_at: '2025-05-01T10:00:00Z',
          },
        ]);
      }

      if (url.pathname === '/repos/octocat/hello-world/issues/1/comments') {
        return jsonResponse([
          {
            id: 12,
            body: 'General note.',
            user: { login: 'reviewer' },
            created_at: '2025-05-01T11:00:00Z',
            updated_at: '2025-05-01T11:00:00Z',
          },
        ]);
      }

      if (url.pathname === '/repos/octocat/hello-world/contents/src/utils/format.ts') {
        if (url.searchParams.get('ref') === 'base-sha') {
          return textResponse('old content');
        }
        return textResponse('new content');
      }

      if (url.pathname === '/repos/octocat/hello-world/contents/src/components/Header.tsx') {
        if (url.searchParams.get('ref') === 'base-sha') {
          return textResponse('');
        }
        return textResponse('header content');
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    const gateway = new ReviewGateway({
      fetchImpl,
      tokenResolver: () => 'token',
    });
    const source: ReviewSourceDraft = {
      provider: 'github',
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/octocat/hello-world/pull/1',
    };

    const { snapshot, initialSelectedFileId } = await gateway.loadReviewSource(source);

    expect(initialSelectedFileId).toBe(snapshot.files[0]?.fileId ?? null);
    expect(snapshot.files[0]?.contentStatus).toBe('loaded');
    expect(snapshot.files[0]?.oldContent).toBe('old content');
    expect(snapshot.files[0]?.newContent).toBe('new content');

    const hydrated = await gateway.hydrateReviewFile(
      snapshot.snapshotId,
      snapshot.files[1]!.fileId,
    );

    expect(hydrated.file.contentStatus).toBe('loaded');
    expect(hydrated.file.newContent).toBe('header content');

    if (originalToken === undefined) {
      delete process.env.REVIEW_GITHUB_TOKEN;
    } else {
      process.env.REVIEW_GITHUB_TOKEN = originalToken;
    }
  });

  it('keeps the snapshot when a later file hydrate fails', async () => {
    const originalToken = process.env.REVIEW_GITHUB_TOKEN;
    process.env.REVIEW_GITHUB_TOKEN = 'token';

    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));

      if (url.pathname === '/repos/octocat/hello-world/pulls/1') {
        return jsonResponse({
          number: 1,
          title: 'Example pull request',
          body: 'Example description',
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' },
        });
      }

      if (url.pathname === '/repos/octocat/hello-world/pulls/1/files') {
        return jsonResponse([
          {
            sha: 'file-1',
            filename: 'src/utils/format.ts',
            status: 'modified',
            additions: 1,
            deletions: 1,
            changes: 2,
            patch: '@@ -1 +1 @@',
            contents_url:
              'https://api.github.com/repos/octocat/hello-world/contents/src/utils/format.ts',
            blob_url: '',
            raw_url: '',
          },
        ]);
      }

      if (url.pathname === '/repos/octocat/hello-world/pulls/1/comments') {
        return jsonResponse([]);
      }

      if (url.pathname === '/repos/octocat/hello-world/issues/1/comments') {
        return jsonResponse([]);
      }

      if (url.pathname === '/repos/octocat/hello-world/contents/src/utils/format.ts') {
        return new Response('missing', { status: 404 });
      }

      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    const gateway = new ReviewGateway({
      fetchImpl,
      tokenResolver: () => 'token',
    });

    const { snapshot } = await gateway.loadReviewSource({
      provider: 'github',
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/octocat/hello-world/pull/1',
    });

    expect(snapshot.files[0]?.contentStatus).toBe('failed');
    expect(snapshot.files[0]?.oldContent).toBe('');
    expect(snapshot.files[0]?.newContent).toBe('');

    if (originalToken === undefined) {
      delete process.env.REVIEW_GITHUB_TOKEN;
    } else {
      process.env.REVIEW_GITHUB_TOKEN = originalToken;
    }
  });

  it('routes a thread reply through the coordinator after loading a snapshot', async () => {
    function makeSession(appSessionId: string, status: AppSession['status']): AppSession {
      const finalResult =
        status === 'completed'
          ? ({
              kind: 'richText' as const,
              format: 'markdown' as const,
              content: 'Assistant thread reply',
              source: 'richText' as const,
            } satisfies AppSession['finalResult'])
          : undefined;
      return {
        appSessionId,
        agent: 'codex',
        cwd: 'C:/workspace',
        status,
        capabilities: [],
        createdAt: '2026-04-05T00:00:00.000Z',
        updatedAt: '2026-04-05T00:00:10.000Z',
        turns: [],
        streamBuffer: { content: '', messageId: null },
        finalResult,
        pendingPermissions: [],
      };
    }

    const fetchImpl = vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));

      if (url.pathname === '/repos/octocat/hello-world/pulls/1') {
        return jsonResponse({
          number: 1,
          title: 'Thread reply test PR',
          body: 'desc',
          base: { sha: 'base-sha' },
          head: { sha: 'head-sha' },
        });
      }
      if (url.pathname === '/repos/octocat/hello-world/pulls/1/files') {
        return jsonResponse([
          {
            sha: 'file-1',
            filename: 'src/utils.ts',
            status: 'modified',
            additions: 1,
            deletions: 1,
            changes: 2,
            patch: '@@ -1 +1 @@',
            contents_url: 'https://api.github.com/repos/octocat/hello-world/contents/src/utils.ts',
            blob_url: '',
            raw_url: '',
          },
        ]);
      }
      if (url.pathname === '/repos/octocat/hello-world/pulls/1/comments') {
        return jsonResponse([]);
      }
      if (url.pathname === '/repos/octocat/hello-world/issues/1/comments') {
        return jsonResponse([]);
      }
      if (url.pathname === '/repos/octocat/hello-world/contents/src/utils.ts') {
        return textResponse('export function x() {}');
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    });

    const store = new ReviewDraftStore();
    const forkSession = vi.fn(async () => makeSession('thread-session-1', 'completed'));
    const sendFollowUp = vi.fn(async () => makeSession('thread-session-1', 'starting'));
    const awaitSettled = vi.fn(async () => makeSession('thread-session-1', 'completed'));

    const gateway = new ReviewGateway({
      fetchImpl,
      tokenResolver: () => 'token',
      draftStore: store,
      agentGateway: {
        awaitSettled,
        continueConversation: vi.fn(),
        forkSession,
        sendFollowUp,
        startSession: vi.fn(),
      },
      now: () => '2026-04-05T00:00:00.000Z',
    });

    const { snapshot } = await gateway.loadReviewSource({
      provider: 'github',
      host: 'https://api.github.com',
      reviewUrl: 'https://github.com/octocat/hello-world/pull/1',
    } satisfies ReviewSourceDraft);

    const run: ReviewRunRecord = {
      runId: 'run-1',
      snapshotId: snapshot.snapshotId,
      reviewAgent: 'codex',
      lensId: 'general',
      instructions: 'review',
      rootAppSessionId: 'root-1',
      status: 'completed',
      resultSource: 'codexOutputSchema',
      createdAt: '2026-04-05T00:00:00.000Z',
      completedAt: '2026-04-05T00:01:00.000Z',
    };
    const envelope: ReviewDraftEnvelope = {
      kind: 'structured',
      run,
      summary: { headline: 'summary', overview: 'ok', positives: [], risks: [] },
      threads: [
        {
          localThreadId: 'thread-1',
          snapshotId: snapshot.snapshotId,
          runId: 'run-1',
          findingId: 'finding-1',
          source: 'ai-review',
          state: 'draft',
          severity: 'medium',
          category: 'correctness',
          confidence: 'high',
          title: 'Off-by-one risk',
          draftBody: 'The zero branch may be skipped.',
          resolvedLocation: { kind: 'overview' },
          anchor: null,
        },
      ],
    };
    store.saveEnvelope(snapshot.snapshotId, envelope);

    const begun = await gateway.beginDraftThreadReply({
      snapshotId: snapshot.snapshotId,
      localThreadId: 'thread-1',
      body: 'Can you confirm the failure mode?',
      cwd: 'C:/workspace',
    });

    expect(begun.reply.localThreadId).toBe('thread-1');
    expect(begun.binding.strategy).toBe('codex-fork');

    const { thread } = await gateway.awaitDraftThreadReplyResult({
      replyId: begun.reply.replyId,
    });

    expect(thread.replyStatus).toBe('idle');
    expect(thread.messages.at(-1)?.body).toBe('Assistant thread reply');
  });

  it('throws when beginDraftThreadReply is called without agentGateway', async () => {
    const gateway = new ReviewGateway({ tokenResolver: () => 'token' });

    await expect(
      gateway.beginDraftThreadReply({
        snapshotId: 'snapshot-1',
        localThreadId: 'thread-1',
        body: 'question',
        cwd: 'C:/workspace',
      }),
    ).rejects.toThrow('not configured');
  });

  it('throws when awaitDraftThreadReplyResult is called for an unknown replyId', async () => {
    const gateway = new ReviewGateway({ tokenResolver: () => 'token' });

    await expect(
      gateway.awaitDraftThreadReplyResult({ replyId: 'nonexistent-reply-id' }),
    ).rejects.toThrow('nonexistent-reply-id');
  });
});
