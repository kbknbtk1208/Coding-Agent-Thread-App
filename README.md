# Coding Agent Thread App

Nextron、Next.js、Electron、Tailwind CSS を使った TypeScript ベースのデスクトップアプリ初期構成です。

## 前提環境

- Windows
- PowerShell
- Node.js 22 系
- npm 10 系

## セットアップ

```powershell
npm install
```

## 開発起動

```powershell
npm run dev
```

`npm run dev` で Next.js の開発サーバと Electron アプリが同時に起動します。

## 構成

- `main/`: Electron メインプロセスと preload
- `renderer/`: Next.js の Pages Router ベース UI
- `resources/`: ビルド用の静的リソース
- `docs/`: 既存ドキュメント

## メモ

- TypeScript は公式 `with-tailwindcss` テンプレート構成をベースにしています。
- preload では既定の `window.ipc` ブリッジを利用します。
- ドキュメントやコードは UTF-8 前提で扱ってください。PowerShell 上で文字化けが出る場合はターミナルの文字コード設定を確認してください。
