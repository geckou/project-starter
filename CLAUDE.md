# CLAUDE.md

このプロジェクトの Claude Code 向け設定。

## プロジェクト概要

Turborepo モノレポ。Next.js 15 (Web) + Expo 52 (Mobile) + Firebase Cloud Functions。
共有コードは `packages/shared` に集約。

このテンプレートは2つの層でできている。

- **第0層（制約層）** — `.claude/hooks/`、本ファイルの規約、`memory/`、プロセス系スキル
  （`/kickoff` `/next` `/questions` `/wrap-up` `/new-skill`）、commitlint・ESLint 共通ルール・Prettier。
  **スタックに依存しない。** AI と人間に規約を機械的に強制するのがこの層の役割
- **スタック層** — 上記の Turborepo 構成・Firebase・課金。参照実装であり、案件によって差し替わる。
  `core` を基点に `firebase` → `functions` → `mobile` / `billing` の opt-in 層に分かれる
  （→「スタック層の構成（層マニフェスト）」）

共有できる実装は npm パッケージとして外部リポジトリへ切り出している
（`@geckou/billing` は [`geckou/kit`](https://github.com/geckou/kit)、
`@geckou/ui-*` は [`geckou/ui`](https://github.com/geckou/ui)）。
このリポジトリに残るのは**規約を強制する仕組みと、組み立て方**。

第0層の設定（ESLint / Prettier / commitlint）も**コピーではなく参照で配る**。
`packages/*-config` として npm へ公開し、各プロジェクトは 1 行の参照だけを持つ
（→「第0層の設定は npm パッケージで配る」）。

**第0層をスタックから独立に保つ**のがこのテンプレートの設計方針。
スタック依存の値をフック本体に直書きしないこと（→「スタック依存の値は `config.sh` に置く」）。

## スタック層の構成（層マニフェスト）

```
core              LP が作れる最小構成（Next.js + Hosting + CI/deploy + 環境切替）
 └ firebase       Auth + Firestore + Storage + rules + emulator + Admin SDK
      └ functions apps/functions（API・トリガー・スケジュール実行の器）
           ├ mobile   Expo（iOS / Android）
           └ billing  Stripe / RevenueCat の配線
```

どの層に何が属するかは **`layers.json`（層マニフェスト）が正**。文章ではなく機械可読な定義で持ち、
`node scripts/remove-layer.mjs <層>` が層を外し、`node scripts/add-layer.mjs <層>`（`/add-*`）が
足し、`node scripts/check-layers.mjs` がマニフェストと実態の一致を検証する（CI で実行）。
使い方は `.claude/docs/layers.md` を参照。

**ファイルを追加・移動・削除したら `layers.json` も更新する。** マニフェストは実態と乖離した瞬間に
嘘になるが、型チェックにもテストにも引っかからない（CI の Layer Manifest Check が検出する）。

1つのファイルに複数の層が混ざる場合は、コメントのマーカーで範囲を囲む
（`.claude/docs/layers.md` の「マーカー」）。マーカーを足したら `layers.json` の `blocks` にも
そのファイルを登録する。

API の置き場所は全構成で `apps/functions` に統一する（`.claude/docs/architecture.md`）。
functions 層を持たない構成は API を持たない。「API Routes で代用する」は選ばない。

## プロダクトの目的（北極星）

> ⚠️ scaffold 後、`planning.md` の「一言で言うと」「目的・ゴール」から転記する。企画書側を更新したら必ずここも更新する。

**<XXX に困っている YYY が、ZZZ するための、Web/Mobile アプリ>**

北極星指標（KPI）: <1行で記入>

実装の判断に迷ったら「この作業は上記の目的に資するか」に立ち返る。

## プロジェクトドキュメント

プロダクトの「何を作るか」「どう作るか」はローカルの `.claude/docs/` で管理する。
実装時はまずこれらを読み、全体像を把握してから作業を始めること。

| ドキュメント | パス | 内容 |
|---|---|---|
| 企画書 | `.claude/docs/planning.md` | プロダクト背景・ターゲット・ペルソナ・用語集・機能一覧 |
| 仕様書 | `.claude/docs/spec.md` | 画面一覧・データモデル・API・セキュリティ（**最新・正**） |
| ロードマップ | `.claude/docs/roadmap.md` | 機能ステータス表（**進捗の正**）・セッション引き継ぎ |
| 確認事項キュー | `.claude/docs/questions.md` | ユーザー確認待ちの判断（→「自律性の境界」）|
| Figma | `<Figma URL>`（⚠️ scaffold 後に実際の URL へ置換。未使用なら行ごと削除） | デザインカンプ |

技術仕様は仕様書を、進捗・タスク状態はロードマップの機能ステータス表を正とする。
企画書はプロダクト背景・ターゲット・優先度の参考として使う。

## プロジェクト進行ルール

### バージョン内のフェーズ順

1つのバージョン（v1.0 等）の中で、機能を以下の順に実装する。
前のフェーズが完了してから次に進む。

```
1_基盤          認証、DB スキーマ、セキュリティルール、共有型定義
    ↓
2_バックエンド   API エンドポイント、Cloud Functions、Webhook
    ↓
3_フロントエンド  ページ、コンポーネント、フォーム、状態管理
    ↓
4_結合          画面とAPIの結合、E2Eテスト、バグ修正
```

### 機能の実装順序

同じフェーズ内では以下の順で選ぶ:

1. **前提機能が全て「完了」** のものを優先（依存が解消されているもの）
2. 優先度が **「必須」→「重要」→「任意」** の順
3. 同じ優先度なら、他の機能から依存されている数が多いものを先に

## 「次何をすればいい？」と聞かれたら

1. `.claude/docs/questions.md` の「回答済み」に、保留のまま再開されていない作業がないか見る
2. **ロードマップの機能ステータス表**で、現在のバージョンの「未着手」の機能を探す。
   あわせて **open な Issue** も候補に入れる（→「見つけた問題は Issue に切る」）
3. **フェーズ順**（基盤→BE→FE→結合）で最も早いものを選ぶ
4. **前提機能**が全て「完了」であることを確認する
5. 機能ステータス表の「関連仕様」に列挙された**仕様書**セクションを読む（画面・データモデル・API）
6. **Figma** リンクがあればデザインを確認する
7. 作業内容・影響範囲・使うスキル・完了条件を宣言し、**そのまま着手する**
   （承認待ちで止まらない。→「自律性の境界」）

この手順は `/next` で実行できる。

## 機能実装フロー

```
1. ロードマップ（.claude/docs/roadmap.md）の機能ステータス表で対象機能を「実装中」に更新
2. 企画書（.claude/docs/planning.md）の用語集でドメイン用語を確認（→ 変数名・コレクション名に使う）
3. 仕様書（.claude/docs/spec.md）のデータモデルを確認 → /new-collection でスキーマ・型・API・テストを生成
4. 仕様書の API を確認 → /new-function でエンドポイントを生成
5. 仕様書の画面一覧 + Figma を確認 → /new-page でページを生成
6. 必要に応じて /new-component, /new-form, /new-store を使う
7. テストを実行（yarn test）
8. 完了条件（Definition of Done）を確認し、機能ステータス表を「完了」に更新
```

### 仕様書ファースト（仕様にない実装依頼を受けたら）

1. 実装する**前に** spec.md（必要なら planning.md のコア機能一覧・roadmap.md の機能ステータス表）に追記し、ユーザーの承認を得る
2. 承認後に実装を開始する
3. 「仕様書に書く → 実装する」の順を崩さない。緊急対応で実装が先行した場合も、同じ作業内で必ず仕様書に反映する

### 機能の完了条件（Definition of Done）

- [ ] `yarn type-check` / `yarn lint` / `yarn test` が通る
- [ ] **差分のセルフレビューを通した**（`/review`。サブエージェントに差分だけを渡して読ませる）
- [ ] テスト方針の必須ケース（API 正常系 + 認証エラー、ルール許可 / 拒否）がある
- [ ] spec.md が実装と一致している（実装中の仕様変更を反映済み）
- [ ] 実装中に導入した新しいドメイン用語を planning.md の用語集に追記した
- [ ] roadmap.md の機能ステータス表を「完了」に更新した

セルフレビューだけは Stop フックで自動実行できない（レビューの実施はコマンドの成否として
判定できないため）。`/review` と `/wrap-up` の手順に置き、PR を出す手前を関門にしている。

### 自律性の境界

**判断が必要になっても、そのたびにセッションを止めない。** 確認事項は
`.claude/docs/questions.md`（確認事項キュー）に積み、**その作業を保留して別の作業へ移る**。
ユーザーは空き時間にまとめて答える（`/questions`）。

原則は「**避けられるなら避ける、避けられないなら聞く**」。推測で決めて進めることはしない
（手戻りとレビュー負荷を作るため）。3段階で扱う。

**1. そのまま進める**

- 仕様書に定義済みの機能の実装・テスト・リファクタ
- バグ修正（挙動を仕様書に合わせる方向）
- ドキュメントの整合更新
- 作業ブランチへの push と **PR の作成**（→「PR は出す、マージは人が決める」）

**2. その作業を保留して、別の作業へ移る（キューに積む）**

判断が要るものは全てここ。キューに積み、その機能の別の部分か、ロードマップの次のタスクへ移る。

- データモデル（スキーマ・コレクション構造）の設計・変更
- セキュリティルール・認証まわりの方針
- 依存パッケージの追加・メジャーアップデート
- 課金・外部サービス連携に関わる変更
- 仕様書にない機能の追加（→ 仕様書ファースト）
- 命名・UI・文言のうち、仕様書とデザインのどちらからも決まらないもの

**進められる作業が尽きたら、そこで聞く。** キューは待ち行列であって、逃げ場ではない。

**3. その場で止めて聞く（キューに積まない）**

取り消せない・外に出る操作。他に作業が残っていても、これ自体は確認が取れるまで実行しない。

- デプロイ・本番環境への操作、本番データの変更・削除
- **PR のマージ**（→「PR は出す、マージは人が決める」）
- 外部への送信・公開（メール送信、決済の実行、**このリポジトリ以外**への Issue・PR の投稿。
  親テンプレートへの報告を含む → 「テンプレート起因の問題を親リポジトリに報告」）
- 履歴の書き換え（force push）、ブランチやファイルの削除

**積み方**: 1項目 = 1判断。推奨案と「これがどの作業をブロックしているか」を必ず書く
（フォーマットは `.claude/docs/questions.md`）。**積んだまま黙って終わらない** —
セッション終了時に未回答を提示する（Stop フックが検出する）。

境界は派生プロジェクトの方針に合わせて調整してよい。

### 見つけた問題は Issue に切る

作業中に別の問題を見つけたとき、**今の差分と同じ関心事なら、その場で直す**。
違う関心事なら **Issue に切って、今の PR には混ぜない**。判断は大きさではなく関心事で行う
（小さいから混ぜてよい、ではない。混ざるとマージの判断が重くなる）。

- 同じ関心事の例: いま編集しているコードの誤り、書いたコードに足りないテスト、
  変更に伴って追従が必要なドキュメント
- 別の関心事の例: 通りがかりに気付いた無関係なバグ、放置されている TODO、
  今回とは別の機能の設計上の問題

**やること = Issue、聞きたいこと = `questions.md`** の2つに置き場を分ける。
判断が要るものは Issue ではなくキューへ（Issue は「やると決まっているが今はやらない」ものだけ）。

立てる前に守ること:

- **実在を確認してから立てる。** 推測で立てない（再現するか、該当箇所を読んで確かめる）
- **既存 Issue を検索して重複を避ける**（`gh issue list --search "<キーワード>"`）
- 本文は「読みやすく書く（分量と構成）」に従う。1層目だけで対応要否が判断でき、
  2層目まで読めば再調査なしで着手できる状態にする
- テンプレートは `.github/ISSUE_TEMPLATE/task.yml`

立てた Issue は**自分で対応する**。`/next` が未着手機能と並べて候補にし、別ブランチ・別 PR で
処理する。PR 本文に `Closes #<番号>` を書けばマージで閉じる。

`gh` が使えない環境（Claude Code の Web / リモートセッション等）では GitHub MCP ツールで代替する。

### PR は出す、マージは人が決める

作業が一区切りしたら、**確認を待たずに push して PR を作る**。人がやるのはマージの判断だけ。

理由は、レビューできる単位で外に出ているほうが、細切れの時間で処理できるため。
手元に未コミットの変更が溜まっている状態は、ユーザーが「今どうなっているか」を
セッションに聞かないと分からない。PR なら差分・CI の結果・自動レビューが揃った状態で残る。

- **粒度は 1 機能 = 1 PR**。「ついでの修正」を混ぜない（混ざるとマージの判断が重くなる）
- PR 本文には**何を確認してほしいか**を書く。仕様書のどのセクションに対応するか、
  未回答の確認事項でブロックされている部分があるならそれも
- DoD が通ってから出す。**セルフレビュー（`/review`）もここに含む** — 赤い PR も、
  自分で読めば分かる指摘が残った PR も、人に見せない
- `release/*` への push はデプロイを発火するため、`pre-git-guard.sh` が承認を求める（PR 経由は対象外）
- **マージは人**。特に `release/*` → `production` はレビュー必須（→「マージルール」）

## テスト方針

| 対象 | テスト内容 | 必須度 |
|---|---|---|
| API エンドポイント | 正常系 + 認証エラーの最低2ケース | 必須 |
| Firestore / Storage ルール | 許可 / 拒否の各パターン（`yarn test:rules` で実行） | 必須 |
| 共有ユーティリティ | 入力バリエーション | 必須 |
| Zustand Store | 状態変更の基本動作 | 推奨 |
| UI コンポーネント | テスト不要（Figma + 目視確認） | - |

テストは `vitest` を使う。ファイルは `tests/` ディレクトリに `<対象>.test.ts` で作成する。

## コーディング規約

### 基本

- インデントはスペース2つ、LF、UTF-8
- シングルクォート、セミコロン省略（Prettier で強制）
- フォーマット系ルールは Prettier に委譲（ESLint では設定しない）
- 複数行ブロック間は空白行を挟む。1行コードは連続可

### 命名規則

| 対象 | ケース | 例 |
|---|---|---|
| ファイル名（通常） | ケバブケース | `user-profile.ts` |
| ファイル名（コンポーネント） | パスカルケース | `UserProfile.tsx` |
| 変数・関数 | キャメルケース | `userName`, `fetchData` |
| 定数 | コンスタントケース | `MAX_RETRY_COUNT` |
| 型名 | パスカルケース | `ChatRoom`, `ApiResponse` |
| CSS クラス名 | スネークケース | `user_icon` |

略語は避け、意味が明確な命名にする（`button` ○ / `btn` ×）。

### JavaScript / TypeScript

- 原則 `const`。やむを得ない場合のみ `let`
- `===` / `!==` を使う
- 配列は複数形（`users`, `messages`）
- `type` を使う（`interface` は使わない）

### React / Next.js

- 関数宣言（`function Name()`）で統一（アロー関数のコンポーネントは使わない）
- default export は Next.js の規約ファイル（`page.tsx`, `layout.tsx` 等）のみ。コンポーネントは named export
- Server Component をデフォルト、必要時のみ `'use client'`
- アイコンは `components/icons/`、定数は `lib/constants/`
- セマンティック HTML + Tailwind CSS でスタイリング
- ESLint: 各ワークスペースの `eslint.config.mjs`（flat config）のルールに従う。
  中身は `@geckou/eslint-config` を参照するだけで、ルール本体は
  `packages/eslint-config/` にある（→「第0層の設定は npm パッケージで配る」）

## Git ブランチ運用

> このセクションのルールは `.claude/hooks/pre-git-guard.sh` が実行前に検証し、違反コマンドはブロックされる（→「フック（強制ルール）」）。

デフォルトブランチは `production`（`main` ではない）。全てのブランチは `production` から切る。

作業開始時は必ず次の順で行う。

```bash
git fetch origin --prune                  # 進行中の release/* を見落とさないため
git branch -r --list 'origin/release/*'   # 進行中のリリースを確認
git checkout production && git pull
git checkout -b feat/<名前>
git merge origin/release/<バージョン>     # そのリリースに載せる場合のみ
```

**分岐元を `production` に保つ理由**: 作業内容を必ずしも進行中のリリースに混ぜるとは
限らないため。`release/*` から切ると、そのリリース行きに固定される。

**それでも release をマージする理由**: `production` は前回リリース時点で止まっており、
進行中の `release/*` より遅れているのが普通のため。マージせずに作業すると、
リリースへ PR を出す段階で大量のコンフリクトになる。

⚠️ `git branch -a` はローカルの参照しか出さない。**fetch せずに「production しか無い」と
判断しないこと。** 詳細は `.claude/docs/git-workflow.md` の「作業ブランチの切り方」。

### ブランチ命名規則

| 種類 | パターン | デプロイ先 |
|---|---|---|
| 機能開発 | `feat/<名前>` | develop |
| リリース | `release/<バージョン>` | staging |
| 緊急修正 | `hotfix/<バージョン>` | staging |
| リファクタ | `refactor/<名前>` | develop |
| バグ修正 | `fix/<名前>` | develop |
| ドキュメント | `docs/<名前>` | - |
| テスト | `test/<名前>` | develop |

ケバブケースで、短く意味が分かる名前にする。チケット番号があれば先頭に付ける。

### コミットメッセージ規約

`<type>: <description>` 形式。type: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `chore`

commitlint（`.husky/commit-msg`）が検証するが、**規約違反は警告のみでコミットはブロックしない**。
派生プロジェクトでは `release/*` に何が載っているかを `git log` で追う場面が多いため、
type が揃っていること自体が可読性の担保になる。守る動機はそこにある。

ただし **Claude のコミットは `.claude/hooks/pre-git-guard.sh`（PreToolUse）が実行前に検証し、
規約外のメッセージはブロックする**。人を止めるほどの重みはないが、AI が規約を読み飛ばすのは
機械的に防げるため（→「フック（強制ルール）」）。

**PR タイトルも同じ規約に従う。** squash merge のコミットメッセージは PR タイトルから
作られるが、commitlint もフックもローカルのコミットしか見ない。
`.github/workflows/pr-title-lint.yml` が PR タイトルを同じ設定で検証する（必須チェックには
しない。赤で気付ければ十分）。可読性だけの話ではなく、`release-tag.yml` の破壊的変更ゲートが
squash コミットの件名を読むため、タイトルが崩れると互換性の判断が効かなくなる。

### マージルール

> **このリポジトリ（`geckou/project-starter` 本体）は以下のマージルールに従わない。**
> 本リポジトリはテンプレートそのものであり、リリースフローを持たない。テンプレート自身の修正は `fix/*` 等から直接 `production` へ PR・マージしてよい。
> 以下のルールは、このテンプレートから scaffold した**派生プロジェクト**に適用する。

- **`production` へマージできるのは `release/*` と `hotfix/*` のみ**（それ以外のブランチからの PR・マージは禁止）
- `production` への直接 push は禁止（PR 必須）
- **`release/*` への直接コミット・push は禁止**（`release/*` への push は staging への自動デプロイを発火するため）。QA で見つかった修正も `fix/*` を切って `release/*` へ PR でマージする。例外は、ブランチ作成時（`production` から切って `feat/*` をマージした結果）の push と、PR マージによる更新のみ
- `release/*` → `production` は PR + レビュー必須
- `hotfix/*` → `production` は PR 必須（緊急時はセルフマージ可）
- `feat/*` → `release/*` へのマージは自由
- `feat/*` 同士のマージは禁止

詳細なリリースフロー・マルチ環境構成は `.claude/docs/git-workflow.md` を参照。

## フック（強制ルール）

CLAUDE.md に書いただけのルールは読み飛ばされうるため、**繰り返し破られるルールは Hook 化して機械的に強制する**（`memory/evolution.md` の Lv.4）。
実体は `.claude/settings.json` + `.claude/hooks/`。

| タイミング | フック | 内容 |
|---|---|---|
| SessionStart | `session-start-git-context.sh` | `git fetch origin --prune` を実行し、現在ブランチ・`origin/production` との差分・進行中の `release/*` を文脈に入れる（古い情報のまま作業を始めるのを防ぐ） |
| SessionStart | `session-start-questions.sh` | 未回答の確認事項（`.claude/docs/questions.md`）を冒頭の文脈に入れる |
| PreToolUse (Bash) | `pre-git-guard.sh` | ブランチ命名・分岐元・fetch 鮮度・コミットメッセージ形式・`--no-verify` 迂回・`production` への直接 push を**実行前にブロック**。`release/*` への push はユーザー承認を求める。検査対象は**このリポジトリへの git 操作だけ**（コマンド中の `cd` / `git -C` を解釈し、別リポジトリへの操作は素通しする） |
| PostToolUse (Bash) | `post-git-branch-reminder.sh` | ブランチ作成直後、進行中の `release/*` があればマージ要否の確認を促す |
| PostToolUse (Edit/Write) | `post-edit-reminder.sh` | `firestore.rules` / `packages/shared` 変更時に検証コマンドをリマインド |
| Stop | `stop-dod-check.sh` | 未コミットのコード変更があれば DoD（type-check / lint / test）を自動実行し、失敗なら終了をブロック |
| Stop | `stop-roadmap-reminder.sh` | 作業があるのに `roadmap.md` 未更新ならリマインド |
| Stop | `stop-questions-reminder.sh` | この作業で確認事項を積んだのに提示していなければ、終了前に一覧を出させる |

### スタック依存の値は `config.sh` に置く

フック本体（`.claude/hooks/*.sh`）は**スタック非依存**に保つ。`yarn` / `firestore.rules` /
`packages/shared` のような、このプロジェクトの構成に依存する値は `.claude/hooks/config.sh` に集める。

| 設定項目 | 用途 |
|---|---|
| `HOOK_RUNNER` | DoD を実行するパッケージマネージャ |
| `HOOK_DOD_TASKS` | DoD として実行するタスク |
| `HOOK_CODE_EXTENSIONS` | DoD の対象になるコードファイルの拡張子 |
| `HOOK_WATCH_PATHS` | 変更時にリマインドするパスと文言 |
| `HOOK_QUESTIONS_FILE` | 確認事項キューの場所 |

`config.sh` は `.templatesyncignore` に登録してあり、テンプレート更新で上書きされない。
逆にテンプレート側で設定項目が増えても自動では流れてこないため、**フック本体は
その項目が無くても既定値で動く**ように書く。フックを追加するときも同じ方針に従う。

### 層マニフェストを変更したら

`layers.json` を変えたら `bash scripts/test-layers.sh`（減算の回帰テスト）と
`node scripts/check-layers.mjs`（実態との一致）を実行する。
どちらも node_modules に依存しないので `yarn install` なしで走る。CI でも実行される。

### フックを変更したら

`pre-git-guard.sh` / `post-edit-reminder.sh` / `stop-dod-check.sh` には回帰テストがある。
フックを変更したら `yarn test:hooks`（実体は `scripts/test-hooks.sh`）を実行する。
node_modules に依存しないので `yarn install` なしでも `bash scripts/test-hooks.sh` で走る。
CI でも実行される。

**フックを追加・変更したらテストも足す。** 設定で挙動が変わるフックは、
設定が効くことと `config.sh` が無くても既定値で動くことの両方を検証する。

### 第0層の設定は npm パッケージで配る

ESLint / Prettier / commitlint の設定は、ツール側が**共有設定を npm パッケージとしてしか
受け付けない**（Renovate preset や reusable workflow のような URL 参照ができない）。
そこで `packages/` 配下に置いて npm へ公開し、各プロジェクトは参照 1 行だけを持つ。

| パッケージ | 参照する側 |
| --- | --- |
| `@geckou/eslint-config`（`.` / `./next` / `./expo`） | 各ワークスペースの `eslint.config.mjs` |
| `@geckou/prettier-config` | `.prettierrc.cjs` |
| `@geckou/commitlint-config` | `commitlint.config.cjs` |

- **ルールを変えるときは `packages/*-config` を直す。** 参照側のファイルに書き足すのは、
  プロジェクト固有の値だけ（例: `.prettierrc.cjs` の `tailwindStylesheet`）
- ESLint のプリセットは**重ねて使わない**。`.` / `./next` / `./expo` はそれぞれ単独で完結する
  （同じプラグインを別々の実体で登録すると ESLint が `Cannot redefine plugin` で落ちるため）
- `type-enum` の値は本ファイルの「コミットメッセージ規約」と `.claude/hooks/pre-git-guard.sh`
  にもある。フックはシェルなので npm パッケージを参照できず、**ここだけは重複が残る**。
  type を増減するときは 3 箇所とも直す
- 公開は `yarn release <パッケージのディレクトリ名>`。version を上げる PR をマージしてから、
  `production` でタグを打つ。**`production` に入っていないコミットからは公開できない**
  （ワークフローが検査する。詳細は `packages/README.md`）

### 依存更新は Renovate の preset で配る

依存更新のルールは `renovate/*.json`（テンプレート側の preset）にあり、各プロジェクトは
`renovate.json5` から `extends` するだけ。**設定のコピーを配らない**ので、ルールの変更は
preset の1コミットで全派生へ届く。判断（メジャーは Dashboard 承認待ちにする、Expo 系は
触らせない、自動マージは opt-in 等）の理由は各ルールの `description` に残す。
詳細と、preset では配れないもの（ルート `package.json` の `resolutions`）は
`.claude/docs/dependencies.md` を参照。

### ドキュメントの参照切れは CI が検出する

コードを移動・削除したときにドキュメントの追従を忘れると、読んだ人と AI が
存在しないパスを前提に作業してしまう。型チェックにもテストにも引っかからないため、
`yarn check:docs`（実体は `scripts/check-docs.sh`）が機械的に検出する。

- 検査対象: 追跡されている Markdown（`.claude/skills/` は除く。スキルは
  「これから作るファイル」を書くものなので、実在しないパスを含むのが正しい）
- 検査内容: リポジトリ相対パスの言及と、Markdown の相対リンク先
- gitignore 対象など意図的に存在しないパスは `ALLOW_MISSING` に追加する

`.github/workflows/docs-check.yml` が全 PR で実行する。`ci.yml` と分けているのは、
`ci.yml` が `**/*.md` を `paths-ignore` しており、ドキュメントだけの PR で走らないため。

### ルールを追加したくなったら

「また同じことを言っている」と感じたら、CLAUDE.md に文章を足すのではなく **Hook にする**。
文章を足しても強制力は上がらない。判定が機械的に書けるなら Hook、手順が長いならスキル（`/new-skill`）にする。

フックを外す・弱めるのは**ユーザーに理由を説明して確認を取ってから**行う。ブロックされたら、迂回ではなく指摘された内容を直す。

## スキル（スラッシュコマンド）

| コマンド | 説明 |
|---|---|
| `/kickoff` | 新規プロジェクトのヒアリング → 企画書・仕様書・ロードマップ作成 |
| `/next` | ロードマップから次のタスクを選定して提案 |
| `/questions` | 溜まった確認事項をまとめて提示し、回答を実装・仕様書へ反映 |
| `/wrap-up` | セッション終了処理（引き継ぎ・メモリ記録・コミット） |
| `/new-page` | Next.js の新規ページ作成 |
| `/new-component` | React コンポーネント作成 |
| `/new-function` | Firebase Cloud Function 追加 |
| `/new-collection` | Firestore コレクション追加（型+API+ルール+テスト） |
| `/new-form` | バリデーション付きフォームコンポーネント作成 |
| `/new-store` | Zustand ストア追加 |
| `/new-locale` | i18n 翻訳キー追加（ja/en 同時） |
| `/new-type` | shared に型定義追加 |
| `/new-app` | モノレポに新しいアプリ追加 |
| `/new-skill` | 新しいスキル（スラッシュコマンド）を作成 |
| `/add-firebase` | firebase 層（Auth + Firestore + Storage）を足す |
| `/add-functions` | functions 層（apps/functions）を足す |
| `/add-mobile` | mobile 層（Expo）を足す |
| `/add-billing` | billing 層（Stripe / RevenueCat）を足す |
| `/init-project` | テンプレートから派生プロジェクトを初期化 |
| `/migrate` | 既存リポジトリの移植 + ドキュメント自動生成 |
| `/review` | プロジェクト構成を前提としたコードレビュー |
| `/deploy` | デプロイ手順ガイド |
| `/troubleshoot` | ビルドエラー・型エラーの診断と修正 |

`/kickoff` `/next` `/questions` `/wrap-up` `/new-skill` は**第0層**（進め方のスキル。スタックに依存しない）。
`/new-*` の scaffold 系と `/add-*` `/init-project` `/deploy` は**スタック層**（生成物がスタックに直結する）。
スキルを追加するときは、どちらに属するかを意識して書く。

## よく使うコマンド

```bash
yarn setup               # 初回セットアップ
yarn dev:web             # Web 開発サーバー
yarn dev:mobile          # Mobile 開発サーバー
yarn build               # 全ビルド
yarn test                # テスト実行
yarn type-check          # 型チェック
yarn lint                # ESLint
yarn firebase:emulators  # Firebase エミュレーター
yarn env:<環境名>        # 環境切り替え（develop / staging / production）
yarn deploy:<環境名>     # デプロイ（develop / staging / production）

node scripts/check-layers.mjs        # 層マニフェストと実態の一致を検証
bash scripts/test-layers.sh          # 層スクリプトの回帰テスト（減算・加算・往復）
node scripts/remove-layer.mjs <層>   # 層を外す（--dry-run で確認のみ）
node scripts/add-layer.mjs <層>      # 層を足す（テンプレートから取り寄せる）

node scripts/adopt-references.mjs --repo <派生のパス>  # 既存の派生を参照方式へ移行する
bash scripts/test-adopt-references.sh                 # 上記スクリプトの回帰テスト

yarn release <パッケージのディレクトリ名>              # packages/*-config を npm へ公開する
```

## テンプレート起因の問題を親リポジトリに報告

このテンプレート（[`geckou/project-starter`](https://github.com/geckou/project-starter)）から作成した派生プロジェクトでは、作業中につまづいた問題が **派生プロジェクト固有のコードではなくテンプレート側に原因がある** と判断した場合、親リポジトリに Issue を立てて還元する。
派生プロジェクト固有の不具合はそれぞれのプロジェクト内で扱えばよく、別途 Issue 化する必要はない。

### 対象になる問題（例）

- スキャフォールド（`.claude/skills/` のスラッシュコマンド）の生成結果がそのままでは動かない
- ルートの設定ファイル（`turbo.json`, `firebase.json`, `firestore.rules`, `.husky/`, ESLint/Prettier 設定等）に不備がある
- CI ワークフロー（`.github/workflows/`）が壊れている / 不足している
- `README.md` / `CLAUDE.md` / `.claude/docs/` の記述が誤っている・古い
- `packages/shared` の共通ユーティリティ・型定義の問題

### 対象外

- 派生プロジェクトのドメインロジック・画面・API の不具合
- 派生プロジェクトで追加した依存・設定変更による問題

### 書いてよいこと・いけないこと

> ⚠️ **親リポジトリは公開を前提とする。** Issue・PR・コミットメッセージは誰でも読める。

**書かない**

- 派生プロジェクト名・リポジトリ名・クライアント名・サービス名
- 派生プロジェクトの URL（GitHub / デプロイ先 / 管理画面）
- 事業上の情報（売上、契約、リリース時期、社内の判断経緯）
- 実在の値を含む設定（プロジェクト ID、ドメイン、API キー、メールアドレス）
- 派生プロジェクト固有のドメインロジックそのもの

**書く**

- テンプレートのどのファイル・どの仕組みに問題があるか
- 再現手順（**テンプレートの初期状態から再現する形**に書き直す）
- 期待する挙動と実際の挙動
- 派生側の事情を伝える必要があるときは匿名化する
  （「ある派生プロジェクトでは 1 つの Firebase プロジェクトに 3 環境を相乗りさせており…」）

**判断基準**: その Issue を第三者が読んだとき、**どの案件の話か特定できないこと**。
特定できてしまうなら、テンプレート側の問題として抽象化し直す。

抽象化すると問題が伝わらない場合は、その情報が本当に必要か疑う。
たいていはテンプレートの構造の問題として言い換えられる。

### 読みやすく書く（分量と構成）

> AI が書く Issue は調査結果を網羅しがちで、人間には読みづらい。Issue は読まれて初めて機能する。
> ただし情報を削ると、今度は後で読む AI（や深掘りする人）が文脈を再調査するはめになる。
> **原則は「削る」ではなく「畳む」**。本文を 2 層に分け、読者によって読む深さを変えられるようにする。

**1 層目（展開されている部分）** — 人間が 1 分で対応要否を判断するための層:

- **冒頭 2〜3 行で要約する**: 何が起きたか / 何を提案するか / 読み手に何をしてほしいか。要約だけで判断できる状態にする
- **本文はスクロール 1 画面以内**（字数ではなく、開いたときに全体像が一目で入るかで判断する）
- **見出しは 2 階層まで**。表や箇条書きの入れ子を深くしない
- 他 Issue との関係は 1 行のリンクに留める。冒頭の引用ブロックで長い経緯説明をしない
- **1 Issue 1 論点**。提案が複数混ざるなら Issue を分ける
- **実装計画の要点を数行で示す**: どのファイル・どの仕組みを変えるか、作業のステップ。読み手が着手コストを見積もれる状態にする

**2 層目（`<details>` に畳む部分）** — 実装時に AI・担当者が参照するための層:

- 調査ログ・検証結果・再現の詳細・長いコード引用・検討した代替案の全記録はここに置く。**捨てない**
- 実装計画の詳細（変更対象ファイルの一覧、手順の順序と依存関係、コード例・設定例、影響範囲と確認方法）もここに書く。2 層目まで読めば計画を立て直さずに着手できることが目標
- `<summary>` には「調査ログ」ではなく「`production` 直近 25 件の規約適合の判定結果」のように、開かなくても中身が分かる見出しを付ける

投稿前のセルフチェック: 1 層目だけ読んで対応要否を判断できるか。2 層目まで読めば再調査なしで着手できるか。

### 立て方

判断したらユーザーに「親リポジトリに Issue を立てますか？」と確認してから、以下のように `gh` で作成する:

```bash
gh issue create \
  -R geckou/project-starter \
  --template bug_report.yml          # 改善提案なら improvement.yml
```

`bug_report.yml` には「派生元のコミット」欄があるので、`git log` で派生元のコミットハッシュを把握して記入する。
重複を避けるため、作成前に必ず `gh issue list -R geckou/project-starter --search "<キーワード>"` で既存 Issue を確認する。

`gh` CLI が使えない環境（Claude Code の Web / リモートセッション等）では、GitHub MCP ツール（Issue の検索・作成）で代替する。それも使えない場合は、Issue 本文の下書きを作成してユーザーに起票を依頼する。

## 進化的メモリシステム

フィードバックの記録・昇格は `memory/evolution.md` のプロトコルに従うこと。

### 必須ルール

- フィードバックを記録する前に、必ず `memory/short-term/` と `memory/long-term/` の既存ファイルを確認する
- 同じ趣旨のフィードバックが既にあれば、新規ファイルを作成せず `pain_count` を +1 する
- `pain_count >= 3` に達したフィードバックは、エッセンスを 1-2 行に蒸留して CLAUDE.md のルールに昇格させる
- 昇格時はユーザーに通知する

### メモリ階層

| 階層 | 場所 | 昇格条件 |
|---|---|---|
| daily | `memory/daily/` | - |
| short-term | `memory/short-term/` | pain_count >= 2 → long-term |
| long-term | `memory/long-term/` | pain_count >= 3 → CLAUDE.md |
| Lv.3 | `CLAUDE.md` | reinforce_count >= 3 → スキル / Hook |
| Lv.4 | スキル / Hook | -（手順型は /new-skill でスキル化、条件型は Hook 化） |

詳細は `memory/evolution.md` を参照。

## 詳細リファレンス

必要に応じて以下を参照:

- `.claude/docs/planning.md` — 企画書（プロダクト背景・ターゲット・ペルソナ・用語集・機能一覧）
- `.claude/docs/spec.md` — 仕様書（画面一覧・データモデル・API・セキュリティ）
- `.claude/docs/roadmap.md` — ロードマップ（機能ステータス表・セッション引き継ぎ）
- `.claude/docs/questions.md` — 確認事項キュー（ユーザー確認待ちの判断と、その積み方）
- `.claude/docs/layers.md` — 層構成と層マニフェスト（層の外し方・マーカー・検証）
- `.claude/docs/dependencies.md` — 依存更新の方針（Renovate preset・automerge・配れないもの）
- `.claude/docs/architecture.md` — API方針、Firebase使い分け、認証、データ取得、環境変数、Zustand、Storage、FCM、Sentry、i18n、課金（Stripe / IAP）、Tailwind、コンポーネント整理
- `.claude/docs/billing.md` — 決済の実装手順（Stripe / IAP のセットアップ、権利判定、チェックリスト、よくある失敗）
- `.claude/docs/nuxt-nextjs.md` — Nuxt.js → Next.js の対応表（Server Component、ルーティング等）
- `.claude/docs/git-workflow.md` — リリースフロー詳細、マルチ環境構成、GCP API 有効化
