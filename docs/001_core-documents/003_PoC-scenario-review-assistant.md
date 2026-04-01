---
updated_at: 2026-04-01T00:00:00+09:00
---

# PoC Scenario - Review Assistant

## 1. この文書の目的

この文書は、PoC 第二弾として成立させるべき PR / MR レビュー支援ユースケースを固定するためのシナリオ定義である。第一弾が「複数コーディングエージェントとの会話基盤の成立確認」であったのに対し、本書は「実データ上でレビュー支援の導線を成立させること」を目的とする。

前提:

- 対象アプリは完成度の高いレビュー製品ではなく、コーディングエージェントを使ったレビュー支援の技術検証アプリである
- 評価対象は UI の装飾ではなく、PR / MR の実データ読込、レビュー草案生成、スレッド分岐、投稿前承認、provider 差分吸収の成立性である
- 現状の `/mr` 画面を拡張する形で進める

## 2. PoC の成功条件

PoC 第二弾の成功条件は次のとおり。

- ユーザーが GitHub か GitLab の PR / MR を選択できる
- ユーザーが実データの diff と既存 discussion を UI で確認できる
- コーディングエージェントが diff と説明文を基にレビュー草案を生成できる
- レビュー指摘が diff 上のローカルコメントとして表示される
- 各指摘に対して独立したスレッド会話が成立する
- スレッド返信を起点に、同じ指摘文脈へ再度エージェントが応答できる
- `PR に投稿` の前にユーザー承認を挟める
- 承認後に GitHub / GitLab API へ実際に投稿できる
- レビュー観点を差し替えて追加できる

## 3. 共通前提

### 3-1. 実行環境

- Electron + Nextron + TypeScript ベースのデスクトップアプリである
- Windows / PowerShell 環境で開発を進める
- `codex app-server` と `copilot --acp --stdio` が利用可能であることを想定する

### 3-2. 共通 UI 要素

全シナリオで少なくとも次の UI を利用する。

- `ReviewProviderSelector`
- `ReviewSourceSelector`
- `DiffViewer`
- `ReviewSummaryPanel`
- `LocalThreadPanel`
- `ThreadComposer`
- `PublishDraftPanel`
- `ReviewLensSelector`

### 3-3. 共通状態

全シナリオで次の状態を扱えることを前提にする。

- `idle`
- `loading_source`
- `drafting_review`
- `showing_local_threads`
- `awaiting_approval`
- `publishing`
- `completed`
- `failed`

### 3-4. 対象データ

PoC では次のどちらか、または両方を検証対象とする。

- GitHub の Pull Request
- GitLab の Merge Request

必須データは次のとおり。

- PR / MR のタイトルと説明
- diff 本文
- 既存コメント / discussion
- コメント投稿に必要な line / side / anchor 情報
- 再投稿時に必要な commit SHA 群

### 3-5. エージェント選択の前提

- `codex` と `copilot` を同じ UI から選べることを前提とする
- レビュー草案生成は provider 差分を UI から隠蔽して扱う
- `codex` は capability があれば fork や steer を活かせる
- `copilot` は native fork がなくても app-side rehydrate で成立させる

## 4. 採用シナリオ一覧

| ID | 優先度 | シナリオ名 | 主目的 | 対象 provider |
| --- | --- | --- | --- | --- |
| R1 | P0 | 実データ読込と diff 表示 | PR / MR 実データの正規化 | GitHub / GitLab |
| R2 | P0 | AI レビュー草案生成 | 総評と指摘草案の生成 | Codex / Copilot |
| R3 | P0 | 指摘ごとの独立スレッド会話 | ローカル thread の継続会話 | Codex / Copilot |
| R4 | P0 | 投稿前承認 | ローカル草案と実投稿の分離 | GitHub / GitLab |
| R5 | P1 | 選択範囲メンション | diff の任意箇所への相談 | Codex / Copilot |
| R6 | P1 | レビュー Lens | 観点別レビューの追加 | Codex / Copilot |

P0 が完了すれば、レビュー支援 PoC の中核は成立する。P1 が完了すれば、実務寄りの拡張ができる見込みを確認できる。

## 5. シナリオ詳細

## R1. 実データ読込と diff 表示

### 目的

- GitHub / GitLab の PR / MR を実データから取得する
- diff と既存 discussion を UI に表示する
- 既存の mock ベース実装を置き換える

### 事前条件

- ユーザーが provider を 1 つ選択している
- ユーザーが対象 PR / MR を選択している
- API 読込に必要な認証情報または接続情報が利用可能である

### ユーザー操作

1. `ReviewProviderSelector` で `github` または `gitlab` を選ぶ
2. `ReviewSourceSelector` で対象 PR / MR を選ぶ
3. diff 表示を開く

### 期待されるシステム挙動

1. UI が対象 source の fetch 要求を送る
2. Gateway が provider API から PR / MR データを取得する
3. diff、discussion、comment anchor が正規化される
4. `DiffViewer` に file list と差分が表示される
5. 既存コメントは thread として diff 上に重ねて描画される

### 合格条件

- mock データではなく実データで動作する
- provider ごとの差は UI では意識しない
- diff と discussion が同時に見える
- 大きい diff でも画面が破綻しない

### 実装メモ

- 最初に通すべき基盤シナリオである
- 表示対象は 1 件の PR / MR から始めてよい

## R2. AI レビュー草案生成

### 目的

- diff と説明文を基にレビュー草案を生成する
- 総評と指摘一覧を structured output として扱う
- ローカル UI にコメント候補を描画する

### 前提

- R1 が完了している
- レビュー対象の snapshot が構築済みである
- structured output を受け取る UI がある

### ユーザー操作

1. `codex` または `copilot` を選ぶ
2. `レビュー実行` を押す
3. 次のようなレビュー観点を指定する

```text
全体の設計、テスト、保守性の観点からレビューして。
指摘は重大度付きで、改善提案も含めて。
```

### 期待されるシステム挙動

1. UI がレビュー実行要求を送る
2. Gateway が review context を組み立てる
3. コーディングエージェントが総評と指摘一覧を返す
4. 指摘はローカル thread として diff 上へ表示される
5. 総評は summary panel に表示される

### 合格条件

- 総評と指摘一覧が分離して扱える
- 指摘は実投稿前の草案として表示される
- provider の出力形式差を UI が吸収できる

### 実装メモ

- structured output を優先するが、失敗時は rich text へフォールバックしてよい
- シナリオの主役は「レビュー支援の見せ方」であり、完全自動修正ではない

## R3. 指摘ごとの独立スレッド会話

### 目的

- 各指摘コメントに紐づく会話を分岐させる
- 複数指摘が同時進行しても文脈が混ざらないことを確認する

### 前提

- R2 が完了している
- 少なくとも 1 つの local thread が表示されている

### ユーザー操作

1. 任意の指摘 thread を開く
2. 返信を投稿する
3. 必要に応じて同じ thread で追加のやりとりを続ける

### 期待されるシステム挙動

1. thread ごとに session の文脈が分離される
2. 返信を起点にエージェントが同じ thread へ再応答する
3. 他の thread の文脈が混入しない
4. thread の履歴は UI 上で追跡できる

### 合格条件

- thread 単位で独立した会話が成立する
- 返信時に review 全体の context が過度に膨らまない
- 1 つのレビュー結果から複数の議論を並列に進められる

### 実装メモ

- Codex は root review session から fork してよい
- Copilot は review summary と thread 履歴を基に app-side rehydrate で成立させる

## R4. 投稿前承認

### 目的

- ローカル草案 thread と実際のコメント投稿を分離する
- 投稿前にユーザーの手動確認を必須にする

### 前提

- R2 または R3 が完了している
- 1 件以上の local thread に投稿候補がある

### ユーザー操作

1. `PR に投稿` を押す
2. 投稿前の草案を確認する
3. 必要なら文面や anchor を修正する
4. 承認して投稿する

### 期待されるシステム挙動

1. UI が投稿候補を表示する
2. Gateway が provider へ送る payload を整形する
3. ユーザー承認後に GitHub / GitLab API を呼ぶ
4. 成功時は thread が remote comment として同期される
5. 失敗時は local draft が保持される

### 合格条件

- いきなり実投稿されない
- 投稿前に内容を修正できる
- 投稿失敗時に草案が失われない

### 実装メモ

- PoC では承認 UI の単純さを優先する
- 完全同期や re-review の自動追従は扱わない

## R5. 選択範囲メンション

### 目的

- diff の任意箇所を選択してエージェントに相談できる
- ユーザー主導のレビュー補助導線を確認する

### 前提

- diff が表示されている
- 範囲選択できる UI がある

### ユーザー操作

1. diff の任意範囲を選択する
2. エージェントへ質問を送る

### 期待されるシステム挙動

1. 選択位置に紐づく context が作られる
2. エージェントがその範囲に限定して応答する
3. 必要なら指摘草案へ昇格できる

### 合格条件

- 任意範囲から相談できる
- 範囲選択と thread 生成が混線しない

## R6. レビュー Lens

### 目的

- 総合レビューとは別の観点で自動評価を追加する
- 例として test 観点、docs 観点、breaking change 観点を試す

### 前提

- R2 が完了している
- レビュー結果を観点別に切り替えられる UI がある

### ユーザー操作

1. `ReviewLensSelector` で観点を選ぶ
2. 選んだ観点でレビューを再実行する

### 期待されるシステム挙動

1. 観点ごとに prompt と schema が切り替わる
2. 観点別の評価結果が個別 UI に表示される
3. 観点追加時に既存 UI を壊さない

### 合格条件

- 観点ごとのレビューが独立して動く
- 新しい lens を後付けできる

## 6. 実装順

1. R1 で実データ取得と diff 表示を通す
2. R2 でレビュー草案生成と local thread 表示を通す
3. R3 で thread 単位の独立会話を通す
4. R4 で投稿前承認と実投稿を通す
5. R5 で選択範囲メンションを追加する
6. R6 でレビュー Lens を追加する

この順にする理由:

- 実データがなければレビュー支援の価値を確認できない
- 草案表示がなければスレッド会話の意味が薄い
- thread 分岐がなければ「レビュー支援」ではなく単なるコメント生成に留まる
- 実投稿の導線は local draft が安定してから入れた方が安全である
- Lens は最初から汎用化しすぎず、後付けで追加できる構造を先に確認する

## 7. シナリオごとの成果物

| シナリオ | 実装で最低限必要な成果物 |
| --- | --- |
| R1 | review source fetch、正規化 snapshot、実 diff renderer |
| R2 | review prompt、structured summary、local thread 草案、summary panel |
| R3 | thread session binding、返信 UI、独立 session 追跡 |
| R4 | draft review payload、承認 UI、GitHub / GitLab 投稿 API |
| R5 | selection context、メンション入力、局所レビュー応答 |
| R6 | lens registry、観点別 prompt、観点別 result renderer |

## 8. やらないシナリオ

PoC 段階では次のシナリオは扱わない。

- diff 更新後の thread 自動再関連付け
- 実投稿後の remote thread 双方向完全同期
- コメントの大量並列投稿制御
- 完全な監査ログと権限制御の整備
- 1 つのレビューで全観点を自動網羅する万能モデル設計

理由:

- 本 PoC の主目的は review 支援の導線と境界設計の成立確認である
- 自動同期や監査の完成度を追うと、レビュー支援の核が見えにくくなる
- まずは local draft と承認付き投稿の境界を安定させるべきである

## 9. 完了判定

最低完了条件:

- R1, R2, R3 が成立する

推奨完了条件:

- 最低完了条件に加えて R4 が成立する

拡張完了条件:

- R5, R6 まで成立し、選択範囲レビューと観点別レビューを含む導線が確認できる

PoC 第二弾の評価は、機能数ではなく「レビュー支援の境界設計が次の拡張に耐えるか」で行う。
