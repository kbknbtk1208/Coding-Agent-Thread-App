import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadMainEnvironment, resolveMainEnvFilePath } from './load-main-environment';

function createTempDir(tempDirs: string[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coding-agent-thread-app-'));
  tempDirs.push(tempDir);
  return tempDir;
}

describe('loadMainEnvironment', () => {
  const originalGitLabToken = process.env.REVIEW_GITLAB_TOKEN;
  const tempDirs: string[] = [];

  afterEach(() => {
    if (originalGitLabToken === undefined) {
      delete process.env.REVIEW_GITLAB_TOKEN;
    } else {
      process.env.REVIEW_GITLAB_TOKEN = originalGitLabToken;
    }

    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('loads environment variables from the cwd .env file', () => {
    delete process.env.REVIEW_GITLAB_TOKEN;

    const rootDir = createTempDir(tempDirs);
    fs.writeFileSync(path.join(rootDir, '.env'), 'REVIEW_GITLAB_TOKEN=from-cwd-env\n', 'utf8');

    const loadedPath = loadMainEnvironment({
      cwd: rootDir,
      mainModuleDir: path.join(rootDir, 'app'),
    });

    expect(loadedPath).toBe(path.join(rootDir, '.env'));
    expect(process.env.REVIEW_GITLAB_TOKEN).toBe('from-cwd-env');
  });

  it('does not overwrite an existing environment variable', () => {
    process.env.REVIEW_GITLAB_TOKEN = 'already-set';

    const rootDir = createTempDir(tempDirs);
    fs.writeFileSync(path.join(rootDir, '.env'), 'REVIEW_GITLAB_TOKEN=from-file\n', 'utf8');

    loadMainEnvironment({
      cwd: rootDir,
      mainModuleDir: path.join(rootDir, 'app'),
    });

    expect(process.env.REVIEW_GITLAB_TOKEN).toBe('already-set');
  });

  it('falls back to the .env next to the compiled main bundle', () => {
    delete process.env.REVIEW_GITLAB_TOKEN;

    const appRootDir = createTempDir(tempDirs);
    const cwdDir = createTempDir(tempDirs);
    fs.mkdirSync(path.join(appRootDir, 'app'));
    fs.writeFileSync(
      path.join(appRootDir, '.env'),
      'REVIEW_GITLAB_TOKEN=from-bundle-root\n',
      'utf8',
    );

    const loadedPath = loadMainEnvironment({
      cwd: cwdDir,
      mainModuleDir: path.join(appRootDir, 'app'),
    });

    expect(loadedPath).toBe(path.join(appRootDir, '.env'));
    expect(process.env.REVIEW_GITLAB_TOKEN).toBe('from-bundle-root');
  });
});

describe('resolveMainEnvFilePath', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns null when no candidate .env file exists', () => {
    const cwdDir = createTempDir(tempDirs);
    const appRootDir = createTempDir(tempDirs);
    fs.mkdirSync(path.join(appRootDir, 'app'));

    expect(
      resolveMainEnvFilePath({
        cwd: cwdDir,
        mainModuleDir: path.join(appRootDir, 'app'),
      }),
    ).toBeNull();
  });
});
