# CLAUDE.md

## Commands

- `package.json` の `scripts` を参照

## Key Documents

- PoCシナリオ: `docs/001_core-documents/001_PoC-scenario.md`
- アーキテクチャ方針: `docs/001_core-documents/002_architecture.md`
- Playwright動作確認手順: `docs/002_quality/playwright-electron-cdp.md`
- 公式Reference: `docs/003_references/`
- ADR: `docs/adr/` (planned)

## Architecture

- 4-layer: Presentation -> App Orchestrator -> Agent Runtime -> Persistence/Domain
- Dependency direction: top-down only

## Development Rules

- 動作確認は `playwright` skill を使用し、手順は `docs/002_quality/playwright-electron-cdp.md` を参照
- スクリーンショットは `.playwright-cli/` に出力し、検証結果とあわせてユーザーに提示
- 実装時は sub agents を活用し、実装→レビュー→修正のサイクルを改善点がなくなるまで繰り返す
- 実装完了時は必ず lint を実行し、結果を確認する

## Constraints

- No `any` -- use `unknown` with type guards
- No default exports -- use named exports
- No direct import from `renderer/` to `main/` -- IPC only
- No modifications to linter/build config files (protected by hooks)
- No `git commit --no-verify`

## Environment

- Windows / PowerShell
