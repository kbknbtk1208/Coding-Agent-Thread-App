import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  process.exit(0);
}

const file = input.tool_input?.file_path || input.tool_input?.path;
if (!file || !/\.(ts|tsx|js|jsx)$/.test(file)) {
  process.exit(0);
}

const resolved = resolve(file);

// Phase 1: Auto-format with Biome (silent fix)
try {
  execSync(`npx biome format --write "${resolved}"`, { stdio: 'pipe' });
} catch {
  // format errors are non-fatal
}

// Phase 2: Auto-fix with Oxlint (silent fix)
try {
  execSync(`npx oxlint --fix "${resolved}"`, { stdio: 'pipe' });
} catch {
  // fix errors are non-fatal
}

// Phase 3: Check remaining violations
let diag = '';
try {
  execSync(`npx oxlint "${resolved}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
  diag = ((e.stdout || '') + '\n' + (e.stderr || '')).trim();
}

if (diag) {
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `Oxlint violations in ${file}:\n${diag.slice(0, 2000)}`,
    },
  };
  process.stdout.write(JSON.stringify(output));
}
