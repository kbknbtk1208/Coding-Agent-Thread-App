import path from 'path';
import type {
  GraphLayerUnclassifiedDirectory,
  GraphLayerUnclassifiedSummary,
  GraphNodeLayerClassification,
} from '../../../shared/poc3-domain/layer-profile';

export interface BuildUnclassifiedDirectorySuggestionsInput {
  classifications: Iterable<GraphNodeLayerClassification>;
  maxDirectories?: number;
  maxExamplesPerDirectory?: number;
}

interface DirectoryBucket {
  directoryPath: string;
  nodeCount: number;
  filePaths: Set<string>;
  exampleFilePaths: string[];
}

function directoryOf(filePath: string): string {
  const directory = path.posix.dirname(filePath);
  return directory === '.' ? '' : directory;
}

function suggestedGlobFor(directoryPath: string, filePaths: Set<string>): string {
  if (!directoryPath && filePaths.size === 1) {
    return Array.from(filePaths)[0] ?? '';
  }
  return directoryPath ? `${directoryPath}/**` : '**/*';
}

export function buildUnclassifiedDirectorySuggestions(
  input: BuildUnclassifiedDirectorySuggestionsInput,
): GraphLayerUnclassifiedSummary {
  const maxDirectories = input.maxDirectories ?? 20;
  const maxExamplesPerDirectory = input.maxExamplesPerDirectory ?? 3;
  const buckets = new Map<string, DirectoryBucket>();
  const allFiles = new Set<string>();
  let nodeCount = 0;

  for (const classification of Array.from(input.classifications)) {
    if (classification.status !== 'unclassified' || !classification.normalizedFilePath) {
      continue;
    }
    nodeCount += 1;
    allFiles.add(classification.normalizedFilePath);
    const directoryPath = directoryOf(classification.normalizedFilePath);
    let bucket = buckets.get(directoryPath);
    if (!bucket) {
      bucket = {
        directoryPath,
        nodeCount: 0,
        filePaths: new Set<string>(),
        exampleFilePaths: [],
      };
      buckets.set(directoryPath, bucket);
    }
    bucket.nodeCount += 1;
    bucket.filePaths.add(classification.normalizedFilePath);
    if (
      bucket.exampleFilePaths.length < maxExamplesPerDirectory &&
      !bucket.exampleFilePaths.includes(classification.normalizedFilePath)
    ) {
      bucket.exampleFilePaths.push(classification.normalizedFilePath);
    }
  }

  const directories: GraphLayerUnclassifiedDirectory[] = Array.from(buckets.values())
    .map((bucket) => ({
      directoryPath: bucket.directoryPath,
      nodeCount: bucket.nodeCount,
      fileCount: bucket.filePaths.size,
      suggestedGlob: suggestedGlobFor(bucket.directoryPath, bucket.filePaths),
      exampleFilePaths: bucket.exampleFilePaths,
    }))
    .sort(
      (a, b) =>
        b.nodeCount - a.nodeCount ||
        b.fileCount - a.fileCount ||
        a.directoryPath.localeCompare(b.directoryPath),
    )
    .slice(0, maxDirectories);

  return {
    nodeCount,
    fileCount: allFiles.size,
    directories,
  };
}
