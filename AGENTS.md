# AGENTS.md

## アプリ概要

- このアプリはCodexとGitHub CopilotをNextron UIから起動・操作するアプリのPoCです。詳細は`README.md`を参照

## 開発コマンド/技術スタック

- `package.json`を参照

## 主要ドキュメント

- このリポジトリで実現すべきPoCシナリオ:`docs\001_core-documents\001_PoC-scenario.md`
- リポジトリの基本アーキテクチャ方針:`docs\001_core-documents\002_architecture.md`
- PoC第二弾のレビュー支援シナリオ:`docs\001_core-documents\003_PoC-scenario-review-assistant.md`
- PoC第二弾のレビュー支援アーキテクチャ:`docs\001_core-documents\004_architecture-review-assistant.md`
- playwrightによる動作確認時のアプリアクセス方法:`docs\002_quality\playwright-electron-cdp.md`
- `codex app-server`/`GitHub copilot acp mode`の公式Reference:`docs\003_references\`

## 開発ルール

- 動作確認は `playwright` skill を使用し、手順と接続方法は `docs\002_quality\playwright-electron-cdp.md` を参照すること。
- スクリーンショットは `.playwright-cli/` ディレクトリに出力し、検証結果とあわせてユーザーに提示すること。
- 実装時は swarm を活用し、実装エージェントが実装し、レビューエージェントがレビューして改善点を指摘し、修正エージェントが修正する流れを、改善点がなくなるまで繰り返すこと。
- 実装完了時は必ず lint を実行し、結果を確認すること。
- PowerShell では UTF-8 関連の文字化けを避けるため、ファイル入出力時は `-Encoding utf8` を明示すること。
- 日本語テキストを外部コマンドへ渡す際は、PowerShell の標準入力パイプ経由を避けること。特に `git commit` はパイプ入力ではなく `-m` を複数回使うか、UTF-8 で保存したメッセージファイルを `-F` で渡すこと。
- PowerShell では `$PID` 系の予約変数と衝突しない名前を使う
