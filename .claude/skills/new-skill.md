---
name: new-skill
description: プロジェクト固有の Claude Code スキル（スラッシュコマンド）を作成する
---

# new-skill

`.claude/skills/` に新しいスキルを作成する。

## 手順

1. ユーザーにスキルの目的を確認する:
   - どんな操作を自動化したいか
   - どんな入力が必要か
   - どんな出力が期待されるか
2. `.claude/skills/<skill-name>.md` を作成する
3. `CLAUDE.md` のスキル一覧に追加する

## テンプレート

````markdown
---
name: <skill-name>
description: <スキルの説明（1行）>
---

# <skill-name>

<スキルが何をするかの概要>

## 手順

1. <ステップ1>
2. <ステップ2>
3. ...

## テンプレート（コード生成する場合）

### <パターン名>

\```typescript
// コードテンプレート
\```

## ルール

- <このスキル固有のルール>
- CLAUDE.md のコーディング規約に従う
````

## スキル名の規約

- ケバブケースで命名する（例: `new-page`, `generate-api-client`）
- 動詞から始める（`new-`, `generate-`, `update-`, `check-`）
- ファイル名とフロントマターの `name` を一致させる

## よくあるスキルの種類

| 種類             | 例                                     | 用途                             |
| ---------------- | -------------------------------------- | -------------------------------- |
| スキャフォールド | `new-page`, `new-component`            | ファイル・コードの雛形を生成     |
| チェック         | `check-deps`, `check-security`         | コードやプロジェクトの状態を検査 |
| 生成             | `generate-api-client`, `generate-mock` | 既存コードから別のコードを生成   |
| 操作             | `deploy`, `migrate-db`                 | 操作手順をガイド                 |
| 分析             | `review`, `analyze-bundle`             | コードを分析してレポート         |

## ルール

- スキルは `.claude/skills/` に1ファイル1スキルで作成する
- フロントマターの `name` と `description` は必須
- 手順は具体的に書く（Claude が判断に迷わないように）
- プロジェクトのコーディング規約（CLAUDE.md）を参照させる
- テンプレートのコード例はシングルクォートで書く
- 作成後、必ず `CLAUDE.md` のスキル一覧テーブルに追記する
