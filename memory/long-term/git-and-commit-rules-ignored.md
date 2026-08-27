---
pain_count: 3
created: 2026-08-27
last_occurred: 2026-08-27
status: evolved
---

## パターン

CLAUDE.md に書かれている Git 運用ルールが繰り返し無視される。

- 作業内容の確認や作業開始を、fetch していない古い remote 情報のまま行う（進行中の `release/*` を見落とす）
- コミットメッセージ規約（`<type>: <description>`）を守らない、または `--no-verify` で commitlint を迂回する

原因は個別の不注意ではなく、これらのルールが「CLAUDE.md に書いてあるだけ」の層
（Lv.3 = 読めば分かるが読み飛ばせる）に留まっていたこと。

## 正しい行動

判定が機械的に書けるルールは、文章を足すのではなく Hook（Lv.4 = 強制実行）に落とす。

## 発生記録

- 2026-08-27: ユーザーから「作業内容の確認を最新ブランチでしたり、コミットルールをたびたび無視する。どう徹底させるか」との指摘。
  Lv.4 へ昇格し、`.claude/hooks/pre-git-guard.sh`（PreToolUse でブロック）、
  `.claude/hooks/session-start-git-context.sh`（SessionStart で自動 fetch）、
  `.claude/hooks/post-git-branch-reminder.sh`（release マージ確認）を追加した。
- 2026-08-27: 上記の作業中に #114 が production へマージされ、コミットメッセージ規約は
  「人を止めるほどの重みはない」として警告のみに変更された。これを受けて強制範囲を
  「人間は警告（husky）／AI はブロック（PreToolUse）」に整理し、
  当初入れた CI の commit-messages ジョブは取り下げた。
