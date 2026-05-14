export interface ParsedGitLabRawDiffFile {
  oldPath: string;
  newPath: string;
  oldMode: string | null;
  newMode: string | null;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  diff: string;
}

interface MutableParsedFile {
  oldPath: string | null;
  newPath: string | null;
  diffOldPath: string | null;
  diffNewPath: string | null;
  oldMode: string | null;
  newMode: string | null;
  newFile: boolean;
  deletedFile: boolean;
  renamedFile: boolean;
  lines: string[];
}

function unquotePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('"') || !trimmed.endsWith('"')) {
    return trimmed;
  }
  try {
    return JSON.parse(trimmed) as string;
  } catch {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
}

function stripDiffPrefix(value: string): string {
  const path = unquotePath(value);
  if (path === '/dev/null') {
    return path;
  }
  return path.replace(/^[ab]\//, '');
}

function splitDiffGitPaths(line: string): { oldPath: string; newPath: string } | null {
  const rest = line.slice('diff --git '.length).trim();
  if (rest.startsWith('"')) {
    const firstEnd = findQuotedEnd(rest, 0);
    if (firstEnd === -1) {
      return null;
    }
    const oldRaw = rest.slice(0, firstEnd + 1);
    const newRaw = rest.slice(firstEnd + 1).trim();
    if (!newRaw) {
      return null;
    }
    return { oldPath: stripDiffPrefix(oldRaw), newPath: stripDiffPrefix(newRaw) };
  }
  const marker = ' b/';
  const markerIndex = rest.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }
  const oldRaw = rest.slice(0, markerIndex);
  const newRaw = rest.slice(markerIndex + 1);
  return { oldPath: stripDiffPrefix(oldRaw), newPath: stripDiffPrefix(newRaw) };
}

function findQuotedEnd(value: string, start: number): number {
  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === '"' && value[index - 1] !== '\\') {
      return index;
    }
  }
  return -1;
}

function parseHeaderPath(line: string, prefix: string): string | null {
  if (!line.startsWith(prefix)) {
    return null;
  }
  const raw = line.slice(prefix.length).trim().split(/\t/)[0] ?? '';
  return stripDiffPrefix(raw);
}

function finalize(file: MutableParsedFile | null): ParsedGitLabRawDiffFile | null {
  if (!file) {
    return null;
  }
  const oldPath = file.oldPath ?? file.diffOldPath ?? file.newPath ?? file.diffNewPath ?? '';
  const newPath = file.newPath ?? file.diffNewPath ?? file.oldPath ?? file.diffOldPath ?? '';
  if (!oldPath && !newPath) {
    return null;
  }
  return {
    oldPath: oldPath === '/dev/null' ? newPath : oldPath,
    newPath: newPath === '/dev/null' ? oldPath : newPath,
    oldMode: file.oldMode,
    newMode: file.newMode,
    newFile: file.newFile || oldPath === '/dev/null',
    deletedFile: file.deletedFile || newPath === '/dev/null',
    renamedFile: file.renamedFile,
    diff: file.lines.join('\n'),
  };
}

export function parseGitLabRawDiff(rawText: string): ParsedGitLabRawDiffFile[] {
  const lines = rawText.split(/\r?\n/);
  const files: ParsedGitLabRawDiffFile[] = [];
  let current: MutableParsedFile | null = null;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      const parsed = finalize(current);
      if (parsed) {
        files.push(parsed);
      }
      const diffPaths = splitDiffGitPaths(line);
      current = {
        oldPath: null,
        newPath: null,
        diffOldPath: diffPaths?.oldPath ?? null,
        diffNewPath: diffPaths?.newPath ?? null,
        oldMode: null,
        newMode: null,
        newFile: false,
        deletedFile: false,
        renamedFile: false,
        lines: [line],
      };
      continue;
    }
    if (!current) {
      continue;
    }
    current.lines.push(line);
    if (line.startsWith('new file mode ')) {
      current.newFile = true;
      current.newMode = line.slice('new file mode '.length).trim() || null;
      continue;
    }
    if (line.startsWith('deleted file mode ')) {
      current.deletedFile = true;
      current.oldMode = line.slice('deleted file mode '.length).trim() || null;
      continue;
    }
    if (line.startsWith('old mode ')) {
      current.oldMode = line.slice('old mode '.length).trim() || null;
      continue;
    }
    if (line.startsWith('new mode ')) {
      current.newMode = line.slice('new mode '.length).trim() || null;
      continue;
    }
    if (line.startsWith('rename from ')) {
      current.renamedFile = true;
      current.oldPath = unquotePath(line.slice('rename from '.length));
      continue;
    }
    if (line.startsWith('rename to ')) {
      current.renamedFile = true;
      current.newPath = unquotePath(line.slice('rename to '.length));
      continue;
    }
    const oldHeader = parseHeaderPath(line, '--- ');
    if (oldHeader) {
      current.oldPath = oldHeader;
      continue;
    }
    const newHeader = parseHeaderPath(line, '+++ ');
    if (newHeader) {
      current.newPath = newHeader;
    }
  }

  const parsed = finalize(current);
  if (parsed) {
    files.push(parsed);
  }
  return files;
}
