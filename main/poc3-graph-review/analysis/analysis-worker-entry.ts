import type { CodeGraphSnapshot, GraphDiagnostic } from '../../../shared/poc3-domain/graph';
import type { ReviewSourceSnapshot } from '../../../shared/poc3-domain/source-snapshot';
import { resolveDiffScope } from './diff-scope-resolver';
import { createTypeScriptProgram } from './typescript-program-factory';
import { extractDependencies } from './dependency-extractor';
import { buildInitialGraph } from './graph-builder';

export interface InitialGraphAnalysisInput {
  revisionId: string;
  worktreePath: string;
  sourceSnapshot: ReviewSourceSnapshot;
}

export interface InitialGraphAnalysisOutput {
  graph: CodeGraphSnapshot;
}

export interface InitialGraphAnalysisProgress {
  phase: 'program' | 'extract' | 'buildGraph';
  message: string;
}

interface RunInitialGraphAnalysisOptions {
  onProgress?: (progress: InitialGraphAnalysisProgress) => void;
}

export async function runInitialGraphAnalysis(
  input: InitialGraphAnalysisInput,
  options: RunInitialGraphAnalysisOptions = {},
): Promise<InitialGraphAnalysisOutput> {
  const diffScope = resolveDiffScope(input.sourceSnapshot);
  const diagnostics: GraphDiagnostic[] = [...diffScope.diagnostics];

  if (diffScope.files.length === 0) {
    options.onProgress?.({
      phase: 'buildGraph',
      message: '変更ファイルがないため空の Graph を構築しています。',
    });
    const graph = buildInitialGraph({
      revisionId: input.revisionId,
      sourceSnapshot: input.sourceSnapshot,
      extraction: {
        symbols: [],
        calls: [],
        imports: [],
        diagnostics: [],
      },
      diagnostics,
    });
    return { graph };
  }

  options.onProgress?.({
    phase: 'program',
    message: 'TypeScript Program を構築しています。',
  });
  const programResult = createTypeScriptProgram(
    input.worktreePath,
    diffScope.files.map((file) => file.filePath),
  );
  diagnostics.push(...programResult.diagnostics);

  options.onProgress?.({
    phase: 'extract',
    message: '依存関係を抽出しています。',
  });
  const extraction = extractDependencies({
    worktreePath: input.worktreePath,
    program: programResult.program,
    diffScope,
  });

  options.onProgress?.({
    phase: 'buildGraph',
    message: '依存関係 Graph を構築しています。',
  });
  const graph = buildInitialGraph({
    revisionId: input.revisionId,
    sourceSnapshot: input.sourceSnapshot,
    extraction,
    diagnostics,
  });

  return { graph };
}
