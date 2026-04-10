# Evolution Protocol

このファイルは、フィードバックの蓄積と自動昇格を管理するプロトコル。

## メモリ階層

| 階層 | ディレクトリ | 強制力 | 内容 |
|---|---|---|---|
| Lv.0 | `memory/daily/` | なし | 日次の学び・生データ |
| Lv.1 | `memory/short-term/` | 弱（意識すればできる） | プロジェクト固有の一時的パターン |
| Lv.2 | `memory/long-term/` | 中（習慣化） | プロジェクト横断的な持続パターン |
| Lv.3 | `CLAUDE.md` | 強（自動適用） | 昇格済みルール |
| Lv.4 | スキル / Hook | 最強（強制実行） | 自動化された行動 |

## pain_count プロトコル

### フィードバック記録時の手順

1. ユーザーからフィードバックを受けたら、`memory/short-term/` と `memory/long-term/` の既存ファイルを確認する
2. **同じ趣旨のフィードバックが既にある場合**:
   - 新規ファイルを作成しない
   - 既存ファイルの `pain_count` を +1 する
   - `last_occurred` を現在日付に更新する
   - 具体的な発生状況を `occurrences` に追記する
3. **新規のフィードバックの場合**:
   - `memory/short-term/` にファイルを作成する（`pain_count: 1`）

### フィードバックファイルのフォーマット

```markdown
---
pain_count: 1
created: YYYY-MM-DD
last_occurred: YYYY-MM-DD
status: active
---

## パターン

（何が起きたか、どんなミスか）

## 正しい行動

（どうすべきだったか）

## 発生記録

- YYYY-MM-DD: （具体的な状況）
```

## 昇格ルール

### short-term → long-term（pain_count >= 2）

- `pain_count` が 2 に達したら `memory/long-term/` に移動
- 複数の発生状況から共通パターンを抽出し、より汎用的な記述に書き換える

### long-term → CLAUDE.md（pain_count >= 3）

- `pain_count` が 3 に達したら以下を実行:
  1. エッセンスを 1-2 行のルールに蒸留する
  2. `CLAUDE.md` の該当セクションに追記する
  3. 元ファイルの `status` を `evolved` に変更する
  4. ユーザーに「ルール昇格」を通知する

### long-term → スキル / Hook（reinforce_count >= 3）

- CLAUDE.md 昇格後もパターンが繰り返される場合:
  - 「手順型」パターン → `.claude/commands/` にスキル化
  - 「条件型」パターン → `settings.json` に Hook 化

## Evolved Rules

（pain_count >= 3 で昇格したルールの履歴）

| 日付 | 元ファイル | 昇格先 | ルール内容 |
|---|---|---|---|
| - | - | - | - |
