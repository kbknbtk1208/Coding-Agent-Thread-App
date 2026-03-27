# structured rendering polish 実装メモ

## 今回やったこと

- `shared/domain/agent.ts` と `main/agent-runtime/shared/runtime-contracts.ts` を拡張し、`result.richText` / `result.structured` に結果の由来を表す `source` と、structured fallback 時の補足情報を持てるようにした
- `shared/domain/implementation-checklist.ts` に parse failure reason を追加し、`emptyResponse` / `jsonParseFailed` / `schemaValidationFailed` を区別できるようにした
- `shared/domain/implementation-checklist.ts` の normalize を見直し、`type: "implementation-checklist"` を要求するようにして schema 整合性を厳格化した
- `main/agent-runtime/codex/codex-runtime.ts` で `outputSchema` 利用時の最終応答を `item/completed` と `rawResponseItem/completed` の両面から拾い、Codex 側の structured 経路を `codexOutputSchema` として扱うようにした
- `main/agent-runtime/copilot/copilot-runtime.ts` で JSON parse 成功時を `promptedJson`、失敗時を `structuredParseFallback` として返すようにした
- `main/agent-gateway/agent-gateway.ts` と `main/agent-gateway/mock-agent-gateway.ts` で新しい `ResultEnvelope` 情報を turn result / final result へ反映するようにした
- `main/agent-gateway/mock-agent-gateway.ts` を structured mode に対応させ、mock でも checklist を返せるようにした
- `renderer/components/sessionConsole.tsx` に `react-markdown` + `remark-gfm` を導入し、rich text 最終結果を Markdown として描画するようにした
- `renderer/components/sessionConsole.tsx` に structured result の source badge、fallback banner、Raw JSON Text 展開表示を追加した
- `package.json` / `package-lock.json` に `react-markdown` と `remark-gfm` を追加した

## 主な変更ファイル

- `shared/domain/agent.ts`
- `shared/domain/implementation-checklist.ts`
- `main/agent-runtime/shared/runtime-contracts.ts`
- `main/agent-runtime/codex/codex-runtime.ts`
- `main/agent-runtime/copilot/copilot-runtime.ts`
- `main/agent-gateway/agent-gateway.ts`
- `main/agent-gateway/mock-agent-gateway.ts`
- `renderer/components/sessionConsole.tsx`
- `package.json`
- `package-lock.json`

## Codex outputSchema の実観測

- `codex-cli 0.116.0` を使って `codex app-server` を直接観測した
- 現行バージョンでは `outputSchema` を指定しても native structured object は別フィールドで返ってこなかった
- 実際には `item/completed` の `agentMessage.text`、および `rawResponseItem/completed` の `message.content[].output_text` に JSON 文字列として返ってきた
- そのため、今回の実装では「native object を直接受け取る」のではなく、「Codex が `outputSchema` で制約した JSON text を structured として採用する」形に寄せている

## 検証結果

- sub agent を使って `実装 -> レビュー -> 修正要否確認` のサイクルを回した
- review agent の結果は `no findings`
- `npm run lint` を通した
- `npm run typecheck` を通した
- Playwright で Electron に CDP 接続し、以下を確認した
- S1: Codex で rich text セッション開始と完了
- S1: 最終結果が Markdown の箇条書き、コード、リンクとして描画されること
- S3: Codex で structured checklist がカード表示され、source badge に `Codex Output Schema` が出ること
- 検証用スクリーンショットを `.playwright-cli/` に出力した
- `.playwright-cli/verify-s1-markdown-renderer.png`
- `.playwright-cli/verify-s3-structured-source-badge.png`

## 到達点

- S1 の「最終結果が Markdown として読みやすく表示される」を満たせる状態になった
- S3 の「structured / rich text fallback を UI で見分ける」を満たす土台ができた
- structured result に対して `Codex Output Schema` と `Prompted JSON` の由来を持てるようになった
- mock でも structured mode を返せるようになり、UI の確認導線が揃った
- Codex `outputSchema` の実態をコードとメモの両方で明文化できた

## 残 TODO

- structured fallback の live path を明示的に再現し、Codex / Copilot それぞれで fallback banner が出ることを E2E で確認する
- Copilot 実 provider でも source badge と fallback 表示を含めた S3 を再確認する
- Codex app-server の将来バージョンで native structured object が返るようになった場合に、その payload を直接採用する経路へ差し替える
- S4 向けに `forkSession` の IPC / Gateway / runtime 契約と UI 操作を追加する
- S5 向けに `steerActiveTurn` の IPC / Gateway / runtime 契約と `running` 中 UI を追加する
- S6 向けに `permission.requested` の UI 表示、許可 / 拒否入力、provider への応答返却を実装する
- 最低限の永続化を追加し、recent sessions と last final result の復元を検討する

## 次の着手順

1. `forkSession` の end-to-end 実装で S4 を通す
2. `steerActiveTurn` の end-to-end 実装で S5 を通す
3. permission mediation の UI を実装して S6 を通す
4. fallback live-path の再現検証と E2E 補強を入れる
5. セッション系の最低限の永続化を追加する
