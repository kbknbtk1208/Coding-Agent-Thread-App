import { readFileSync } from 'node:fs';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  process.exit(0);
}

const file = input.tool_input?.file_path || input.tool_input?.path || '';

const PROTECTED_PATTERNS = [
  'biome.json',
  'biome.jsonc',
  '.eslintrc',
  'eslint.config',
  'tsconfig.json',
  '.prettierrc',
  'lefthook.yml',
  'lefthook-local.yml',
  '.pre-commit-config.yaml',
  'electron-builder.yml',
];

// Normalize to forward slashes for cross-platform matching
const normalizedFile = file.replace(/\\/g, '/');
const basename = normalizedFile.split('/').pop() || '';

for (const pattern of PROTECTED_PATTERNS) {
  if (basename === pattern || normalizedFile.endsWith('/' + pattern)) {
    process.stderr.write(
      `BLOCKED: ${file} is a protected config file. Fix the code, not the linter/build config. ` +
        'If you genuinely need to change this file, ask the user for permission.',
    );
    process.exit(2);
  }
}
