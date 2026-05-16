import { describe, expect, it } from 'vitest';
import { parseGitLabRawDiff } from './gitlab-raw-diff-parser';

describe('parseGitLabRawDiff', () => {
  it('parses modified, new, deleted, renamed, quoted, and Japanese paths', () => {
    const raw = [
      'diff --git a/src/old name.ts b/src/new name.ts',
      'similarity index 80%',
      'rename from src/old name.ts',
      'rename to src/new name.ts',
      '--- a/src/old name.ts',
      '+++ b/src/new name.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/none b/docs/追加.md',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/docs/追加.md',
      '@@ -0,0 +1 @@',
      '+hello',
      'diff --git "a/src/quoted path.ts" "b/src/quoted path.ts"',
      'deleted file mode 100644',
      '--- "a/src/quoted path.ts"',
      '+++ /dev/null',
      '-gone',
    ].join('\n');

    const files = parseGitLabRawDiff(raw);

    expect(files).toHaveLength(3);
    expect(files[0]).toMatchObject({
      oldPath: 'src/old name.ts',
      newPath: 'src/new name.ts',
      renamedFile: true,
      newFile: false,
      deletedFile: false,
    });
    expect(files[1]).toMatchObject({
      oldPath: 'docs/追加.md',
      newPath: 'docs/追加.md',
      newFile: true,
    });
    expect(files[2]).toMatchObject({
      oldPath: 'src/quoted path.ts',
      newPath: 'src/quoted path.ts',
      deletedFile: true,
    });
  });

  it('returns an empty list for input without diff headers', () => {
    expect(parseGitLabRawDiff('@@ -1 +1 @@\n-old\n+new')).toEqual([]);
  });

  it('decodes Git C-style octal quoted paths as UTF-8', () => {
    const raw = [
      'diff --git "a/docs/\\346\\227\\245\\346\\234\\254\\350\\252\\236.md" "b/docs/\\346\\227\\245\\346\\234\\254\\350\\252\\236.md"',
      '--- "a/docs/\\346\\227\\245\\346\\234\\254\\350\\252\\236.md"',
      '+++ "b/docs/\\346\\227\\245\\346\\234\\254\\350\\252\\236.md"',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n');

    expect(parseGitLabRawDiff(raw)[0]).toMatchObject({
      oldPath: 'docs/日本語.md',
      newPath: 'docs/日本語.md',
    });
  });
});
