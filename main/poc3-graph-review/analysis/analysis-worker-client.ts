import type {
  InitialGraphAnalysisInput,
  InitialGraphAnalysisProgress,
  InitialGraphAnalysisOutput,
} from './analysis-worker-entry';
import { runInitialGraphAnalysis } from './analysis-worker-entry';
import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

function resolveWorkerEntryPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'main', 'poc3-graph-review', 'analysis', 'analysis-worker-entry.ts'),
    path.join(__dirname, 'analysis-worker-entry.js'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export class AnalysisWorkerClient {
  async runInitialGraphAnalysis(
    input: InitialGraphAnalysisInput,
    onProgress?: (progress: InitialGraphAnalysisProgress) => void,
  ): Promise<InitialGraphAnalysisOutput> {
    const entry = resolveWorkerEntryPath();
    if (!entry) {
      return runInitialGraphAnalysis(input, { onProgress });
    }

    return new Promise<InitialGraphAnalysisOutput>((resolve, reject) => {
      let settled = false;
      const worker = new Worker(
        `
          const fs = require('fs');
          const { parentPort, workerData } = require('worker_threads');
          const ts = require('typescript');

          require.extensions['.ts'] = function(module, filename) {
            const source = fs.readFileSync(filename, 'utf8');
            const output = ts.transpileModule(source, {
              compilerOptions: {
                module: ts.ModuleKind.CommonJS,
                target: ts.ScriptTarget.ES2020,
                esModuleInterop: true,
                moduleResolution: ts.ModuleResolutionKind.NodeJs,
                jsx: ts.JsxEmit.ReactJSX,
              },
            }).outputText;
            module._compile(output, filename);
          };

          Promise.resolve()
            .then(() => {
              const entrypoint = require(workerData.entry);
              return entrypoint.runInitialGraphAnalysis(workerData.input, {
                onProgress: (progress) => parentPort.postMessage({ type: 'progress', progress }),
              });
            })
            .then((result) => parentPort.postMessage({ type: 'result', ok: true, result }))
            .catch((error) => parentPort.postMessage({
              type: 'result',
              ok: false,
              message: error && error.message ? error.message : String(error),
              stack: error && error.stack ? error.stack : null,
            }));
        `,
        {
          eval: true,
          workerData: { entry, input },
        },
      );
      worker.on('message', (message: unknown) => {
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'progress' &&
          'progress' in message
        ) {
          onProgress?.(message.progress as InitialGraphAnalysisProgress);
          return;
        }
        settled = true;
        void worker.terminate();
        if (
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'result' &&
          'ok' in message &&
          message.ok === true &&
          'result' in message
        ) {
          resolve(message.result as InitialGraphAnalysisOutput);
          return;
        }
        const errorMessage =
          message &&
          typeof message === 'object' &&
          'type' in message &&
          message.type === 'result' &&
          'message' in message
            ? String(message.message)
            : 'Analysis worker failed';
        reject(new Error(errorMessage));
      });
      worker.once('error', (err) => {
        settled = true;
        void worker.terminate();
        reject(err);
      });
      worker.once('exit', (code) => {
        if (!settled && code !== 0) {
          reject(new Error(`Analysis worker exited with code ${code}`));
        }
      });
    });
  }
}
