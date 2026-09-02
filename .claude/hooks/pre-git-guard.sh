#!/usr/bin/env sh
# PreToolUse (Bash) フック: CLAUDE.md「Git ブランチ運用」「コミットメッセージ規約」を
# 実行前に検証する（memory/evolution.md の Lv.4 = 強制実行）。
#
# 機械的に白黒つく違反は deny（exit 2 でブロック。Claude が自力で直して再実行できる）、
# 例外がありうる操作は ask（ユーザーに承認を求める）で扱う。

command -v jq >/dev/null 2>&1 || exit 0

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

[ -z "$cmd" ] && exit 0

# heredoc の本文は、他のプログラムへ渡されるデータ（ファイルの中身、スクリプト、
# ドキュメント）であって実行される git コマンドではないため、検査対象から外す。
# ここを見てしまうと、コマンド例を含むドキュメントやスクリプトを書けなくなる。
# 例外は 2 つ:
#   - commit -m "$(cat <<'EOF' ...)" -> 本文はコミットメッセージそのものなので検査する
#   - sh / bash <<'EOF' ...          -> 本文は実際に実行されるので検査する
cmd=$(printf '%s' "$cmd" | awk '
  in_body {
    line = $0
    # <<- 形式は終了マーカー行の先頭タブを許容する
    if (tab_ok) { sub(/^\t+/, "", line) }
    if (line == marker) { in_body = 0 }
    next
  }
  {
    print
    # <<<"x"（here-string）は heredoc ではない。誤認すると以降の行が検査から落ちる
    if (match($0, /<<-?[[:space:]]*"?'"'"'?[A-Za-z_][A-Za-z_0-9]*'"'"'?"?/) &&
        (RSTART == 1 || substr($0, RSTART - 1, 1) != "<") &&
        $0 !~ /git[[:space:]]+commit/ &&
        $0 !~ /(^|[[:space:]|;&(])(sh|bash|zsh|dash|ksh)([[:space:]]|$)/) {
      marker = substr($0, RSTART, RLENGTH)
      tab_ok = (substr(marker, 1, 3) == "<<-")
      sub(/^<<-?[[:space:]]*/, "", marker)
      gsub(/["'"'"']/, "", marker)
      in_body = 1
    }
  }
')

printf '%s' "$cmd" | grep -q 'git' || exit 0

# --- 検査対象の絞り込み -------------------------------------------------
# このフックはこのリポジトリのブランチ運用を守るためのもので、別リポジトリの
# 運用には関知しない。コマンド文字列だけを見て判定すると、先頭の cd や
# git -C を無視して「隣のリポジトリへの commit」までこのリポジトリのルールで
# ブロックしてしまうため、実行ディレクトリを解釈して対象を絞る。

session_gitdir=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
session_gitdir=$(cd "$session_gitdir" 2>/dev/null && pwd -P) || exit 0

# git のグローバルオプション（サブコマンドより前に置くもの）
GIT_OPT_WITH_VALUE='-C|-c|--git-dir|--work-tree|--namespace|--exec-path|--super-prefix'
GIT_OPT_BOOL='--no-pager|--paginate|--bare|--no-replace-objects|--literal-pathspecs|--no-optional-locks'

# パスを絶対パスへ解決する。解決できなければ何も出力せず 1 を返す（= 判定不能）
resolve_dir() {
  _path=$1
  case $_path in
    '~') _path=$HOME ;;
    '~/'*) _path=$HOME/${_path#'~/'} ;;
    # 変数・コマンド置換はフックからは展開できない
    *'$'* | *'`'*) return 1 ;;
  esac
  case $_path in
    /*) (cd "$_path" 2>/dev/null && pwd -P) ;;
    *) (cd "$2" 2>/dev/null && cd "$_path" 2>/dev/null && pwd -P) ;;
  esac
}

# 指定パスが属するリポジトリの共通 git dir（worktree でも本体を指す）
gitdir_of() {
  (cd "$1" 2>/dev/null &&
    _g=$(git rev-parse --git-common-dir 2>/dev/null) &&
    cd "$_g" 2>/dev/null && pwd -P)
}

unquote() { printf '%s' "$1" | sed -e "s/^'\(.*\)'$/\1/" -e 's/^"\(.*\)"$/\1/'; }

# コマンドを区切り文字（; & && | || 改行 括弧）で分割する。クォートの中の
# 区切り文字は無視する（コミットメッセージ中の ; で切らないため）。
# 括弧はサブシェルの開始・終了として印を出す（cd の効果を閉じ括弧で戻すため）。
NL='
'
SUB_OPEN=$(printf '\001(')
SUB_CLOSE=$(printf '\001)')
# 絞り込みループ（サブシェル）から親へ渡す印。変数は引き継げないため行として出す
MARK_DIR=$(printf '\001dir')
MARK_HOOKSPATH=$(printf '\001hookspath')

segments=$(printf '%s' "$cmd" | awk '
  BEGIN {
    sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92)
    sub_open = sprintf("%c(", 1); sub_close = sprintf("%c)", 1)
  }
  { all = all $0 "\n" }
  END {
    q = ""; seg = ""; n = length(all)
    for (i = 1; i <= n; i++) {
      c = substr(all, i, 1)
      if (q == sq) { seg = seg c; if (c == sq) q = ""; continue }
      if (q == dq) {
        if (c == bs) { seg = seg c substr(all, i + 1, 1); i++; continue }
        seg = seg c
        if (c == dq) q = ""
        continue
      }
      if (c == bs) { seg = seg c substr(all, i + 1, 1); i++; continue }
      if (c == sq || c == dq) { q = c; seg = seg c; continue }
      if (c == "(" || c == ")") {
        print seg; seg = ""
        print (c == "(") ? sub_open : sub_close
        continue
      }
      # 2>&1 や &> はリダイレクトであってコマンドの区切りではない。
      # 区切り扱いすると `git push 2>&1` が `git push 2>` になり判定から外れる
      if (c == "&" && (seg ~ />[[:space:]]*$/ || substr(all, i + 1, 1) == ">")) {
        seg = seg c
        continue
      }
      if (c == ";" || c == "\n" || c == "&" || c == "|") {
        print seg; seg = ""
        if ((c == "&" || c == "|") && substr(all, i + 1, 1) == c) i++
        continue
      }
      seg = seg c
    }
    print seg
  }
')

# このリポジトリを対象にした git 呼び出しだけを残す。cd の効果は後続の
# セグメントへ引き継ぐが、サブシェルを抜けたら元へ戻す。戻さないと
# `(cd /other && git status) && git commit` の commit まで別リポジトリ扱いになり、
# production への直接コミットを素通しする抜け道になる。
cmd=$(printf '%s\n' "$segments" | {
  work_dir=$(pwd -P)
  prev_dir=$work_dir
  dir_stack=''

  while IFS= read -r seg; do
    case $seg in
      "$SUB_OPEN")
        dir_stack="$work_dir$NL$prev_dir$NL$dir_stack"
        continue
        ;;
      "$SUB_CLOSE")
        if [ -n "$dir_stack" ]; then
          work_dir=${dir_stack%%"$NL"*}
          dir_stack=${dir_stack#*"$NL"}
          prev_dir=${dir_stack%%"$NL"*}
          dir_stack=${dir_stack#*"$NL"}
        fi
        continue
        ;;
    esac

    seg=${seg#"${seg%%[![:space:]]*}"}
    seg=${seg%"${seg##*[![:space:]]}"}
    [ -z "$seg" ] && continue

    case $seg in
      cd | cd[[:space:]]*)
        target=${seg#cd}
        target=${target#"${target%%[![:space:]]*}"}
        # クォート付きのパスは閉じクォートまでを 1 引数として取る。
        # 空白までで切ると `cd "/path/with spaces"` が解決できず、
        # 別リポジトリなのに検査対象に残ってしまう
        case $target in
          \'*) target=${target#\'}; target=${target%%\'*} ;;
          \"*) target=${target#\"}; target=${target%%\"*} ;;
          *) target=${target%%[[:space:]]*} ;;
        esac
        last_dir=$work_dir
        case $target in
          '') work_dir=$HOME ;;
          '-') work_dir=$prev_dir ;;
          *) work_dir=$(resolve_dir "$target" "$work_dir") || work_dir='' ;;
        esac
        prev_dir=$last_dir
        continue
        ;;
    esac

    printf '%s' "$seg" | grep -Eq '(^|[[:space:]/])git([[:space:]]|$)' || continue

    # /usr/bin/git のような絶対パス呼び出しを `git` へ正規化する。
    # 以降の判定は全て `git <サブコマンド>` の形を見るため、ここで揃えないと
    # パス付きの呼び出しだけが検査を素通りする
    seg=$(printf '%s' "$seg" |
      sed -E 's#(^|[[:space:]])[^[:space:]]*/git([[:space:]]|$)#\1git\2#g')

    # -c core.hooksPath=... は husky（commitlint / lint-staged）を無効化する。
    # 下でグローバルオプションを剥がす前に見ないと素通りする
    case $seg in
      *-c[[:space:]]core.hooksPath*) printf '%s\n' "$MARK_HOOKSPATH" ;;
    esac

    # git -C / --git-dir はセグメント単位で実行ディレクトリを上書きする
    git_dir_opt=$(printf '%s' "$seg" | awk '
      BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34) }
      # クォート付きの値は閉じクォートまで連結して 1 引数として返す
      function argval(j,   v, q, n) {
        v = $(j + 1)
        q = substr(v, 1, 1)
        if (q != sq && q != dq) return v
        n = j + 1
        while (!(length(v) > 1 && substr(v, length(v), 1) == q) && n < NF) {
          n++
          v = v " " $n
        }
        if (length(v) > 1 && substr(v, length(v), 1) == q) {
          v = substr(v, 2, length(v) - 2)
        }
        return v
      }
      {
        for (i = 1; i <= NF; i++) {
          if ($i != "git") continue
          for (j = i + 1; j <= NF; j++) {
            t = $j
            if (substr(t, 1, 1) != "-") break
            if (t == "-C" || t == "--git-dir") { print argval(j); exit }
            if (t ~ /^--git-dir=/) { sub(/^--git-dir=/, "", t); print t; exit }
            if (t == "-c" || t == "--work-tree" || t == "--namespace" ||
                t == "--exec-path" || t == "--super-prefix") j++
          }
        }
      }
    ')

    target_dir=$work_dir
    if [ -n "$git_dir_opt" ]; then
      target_dir=$(resolve_dir "$(unquote "$git_dir_opt")" "$work_dir") || target_dir=''
    fi

    # 実行ディレクトリを特定できないときは安全側に倒して検査対象に残す
    if [ -n "$target_dir" ] && [ "$(gitdir_of "$target_dir")" != "$session_gitdir" ]; then
      continue
    fi

    # 以降の判定が `git <サブコマンド>` の形だけを見ればよいよう、
    # サブコマンドより前のグローバルオプションを取り除く
    while :; do
      next=$(printf '%s' "$seg" | sed -E \
        -e "s/(^|[[:space:]])git[[:space:]]+($GIT_OPT_WITH_VALUE)([[:space:]]+|=)(\"[^\"]*\"|'[^']*'|[^[:space:]]+)[[:space:]]+/\1git /" \
        -e "s/(^|[[:space:]])git[[:space:]]+($GIT_OPT_BOOL)[[:space:]]+/\1git /")
      [ "$next" = "$seg" ] && break
      seg=$next
    done

    # 判定に使う「現在ブランチ」は、このセグメントが実際に動くディレクトリで見る。
    # セッションの HEAD で判定すると、git -C <同一リポの別 worktree> で逆の結果になる
    printf '%s%s\n' "$MARK_DIR" "$target_dir"
    printf '%s\n' "$seg"
  done
})

[ -n "$cmd" ] || exit 0

hooks_path_bypass=$(printf '%s\n' "$cmd" | grep -c "^$MARK_HOOKSPATH$")
guard_dir=$(printf '%s\n' "$cmd" | sed -n "s/^$MARK_DIR//p" | head -1)
cmd=$(printf '%s\n' "$cmd" | grep -v "^$MARK_DIR" | grep -v "^$MARK_HOOKSPATH$")

[ -n "$cmd" ] || exit 0

TYPES='feat|fix|refactor|style|docs|test|chore'
DOC='詳細は CLAUDE.md「Git ブランチ運用」/ .claude/docs/git-workflow.md を参照。'

deny() {
  printf '%s\n%s\n' "$1" "$DOC" >&2
  exit 2
}

ask() {
  jq -n --arg r "$1
$DOC" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
  exit 0
}

has() { printf '%s' "$cmd" | grep -Eq "$1"; }

current=$(git -C "${guard_dir:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)

# --- 検証のスキップ禁止 -------------------------------------------------
# lint-staged（pre-commit のフォーマット / lint）を迂回されると壊れたコードが入る。
# commitlint 側は警告のみだが、迂回すればメッセージ規約への気付きも失われる。
if { has '(^|[[:space:]])git[[:space:]]+(commit|push)' && has '(^|[[:space:]])--no-verify([[:space:]]|$)'; } ||
  has '(^|[[:space:]])git[[:space:]]+commit[[:space:]]+-n([[:space:]]|$)'; then
  deny '--no-verify / commit -n による検証スキップは禁止です。pre-commit の lint-staged（フォーマット / lint）まで飛ばしてしまうため、失敗したら迂回せず原因を直してください。'
fi

if [ "${hooks_path_bypass:-0}" -gt 0 ]; then
  deny '-c core.hooksPath による husky の無効化は禁止です（--no-verify と同じ迂回）。失敗したら迂回せず原因を直してください。'
fi

# --- コミット -----------------------------------------------------------
if has '(^|[[:space:]])git[[:space:]]+commit([[:space:]]|$)'; then
  case "$current" in
    production)
      deny "production への直接コミットは禁止です（PR 必須）。作業ブランチを切ってください。"
      ;;
    release/*)
      deny "release/* への直接コミットは禁止です（push が staging への自動デプロイを発火するため）。fix/* を切って release へ PR でマージしてください。現在: $current"
      ;;
  esac

  msg_ng="コミットメッセージ規約違反です。'<type>: <description>' 形式にしてください（type: feat, fix, refactor, style, docs, test, chore）。例: 'feat: ユーザープロフィール画面を追加'"

  # メッセージの渡し方は -m / --message と -F / --file の 2 通り。
  # どちらも検証する（--amend --no-edit のようなメッセージ再利用は対象外）。
  if has '(^|[[:space:]])(-m|--message)([[:space:]]|=)'; then
    # `--message=feat:\ x` のように、シェルのエスケープ付きで渡される形も通す
    has "(^|[[:space:]\"'=])($TYPES)(\([^)]+\))?:(\\\\)?[[:space:]][^[:space:]]" ||
      deny "$msg_ng"
  fi

  if has '(^|[[:space:]])(-F|--file)([[:space:]]|=)'; then
    msg_file=$(printf '%s' "$cmd" |
      grep -oE '(^|[[:space:]])(-F|--file)[[:space:]=]+[^[:space:];&|]+' |
      head -1 | sed -E 's/.*(-F|--file)[[:space:]=]+//')

    # フックはコマンド文字列をそのまま見るため、変数や置換を含むパスは展開されない。
    # 検証できないものを黙って通すと素通りの経路になるので、リテラルのパスを求める。
    case "$msg_file" in
      *'$'* | *'`'* | '~'*)
        deny "コミットメッセージのファイル指定に変数・置換・~ が含まれるため、規約を検証できません。リテラルのパスで渡すか、-m でメッセージを渡してください: $msg_file"
        ;;
    esac

    [ -r "$msg_file" ] ||
      deny "コミットメッセージのファイル '$msg_file' が読めないため規約を検証できません。先にファイルを作成するか、-m でメッセージを渡してください。"

    if ! grep -m1 -v '^[[:space:]]*$' "$msg_file" |
      grep -Eq "^($TYPES)(\([^)]+\))?: [^[:space:]]"; then
      deny "$msg_ng（'$msg_file' の1行目）"
    fi
  fi

  # -t / --template はエディタ起動前提でメッセージを事前に検証できない
  if has '(^|[[:space:]])(-t|--template)([[:space:]]|=)'; then
    deny "-t / --template は使用できません。メッセージを事前に検証できないため、-m または -F でメッセージを渡してください。"
  fi
fi

# --- push ---------------------------------------------------------------
if has '(^|[[:space:]])git[[:space:]]+push'; then
  # push の宛先ブランチを refspec から取り出す。
  # `git push` / `git push origin` / `git push origin HEAD` はどれも現在ブランチが
  # 宛先になるため、文字列に production が現れなくても production への push になる。
  # 各行を「<force か> <宛先>」で出す（宛先が現在ブランチなら @CURRENT）
  push_targets=$(printf '%s\n' "$cmd" | awk '
    /(^|[[:space:]])git[[:space:]]+push([[:space:]]|$)/ {
      force = 0
      remote_seen = 0
      refspecs = 0
      started = 0

      for (i = 1; i <= NF; i++) {
        if (!started) { if ($i == "push") started = 1; continue }

        if (substr($i, 1, 1) == "-") {
          if ($i ~ /^(--force([^-]|$)|--force-with-lease|-f$)/) force = 1
          # 値を取るオプションは次のトークンを読み飛ばす
          if ($i == "-o" || $i == "--push-option" || $i == "--repo" ||
              $i == "--receive-pack" || $i == "--exec" || $i == "-4" && 0) i++
          continue
        }

        if (!remote_seen) { remote_seen = 1; continue }

        refspecs++
        dst = $i
        if (index(dst, ":") > 0) dst = substr(dst, index(dst, ":") + 1)
        sub(/^refs\/heads\//, "", dst)
        sub(/^\+/, "", dst)
        if (dst == "HEAD" || dst == "") dst = "@CURRENT"
        print force " " dst
      }

      # refspec を書かない形は現在ブランチが宛先（push.default = simple / current）
      if (refspecs == 0) print force " @CURRENT"
    }
  ')

  printf '%s\n' "$push_targets" | while IFS=' ' read -r force dst; do
    [ -n "$dst" ] || continue
    [ "$dst" = "@CURRENT" ] && dst=$current

    case "$dst" in
      production) exit 10 ;;
    esac

    if [ "$force" = "1" ]; then
      case "$dst" in
        production | release/*) exit 11 ;;
      esac
    fi

    case "$dst" in
      release/* | hotfix/*) exit 12 ;;
    esac
  done
  push_verdict=$?

  case "$push_verdict" in
    10) deny 'production への直接 push は禁止です（PR 必須）。' ;;
    11) deny 'production / release/* への force push は禁止です。' ;;
    12)
      ask "release/* / hotfix/* への push は staging への自動デプロイを発火します。ブランチ作成時または PR マージ以外の push は禁止です。実行してよいかユーザーに確認してください。"
      ;;
  esac
fi

# --- ブランチ作成 -------------------------------------------------------
# -B / -C（既存ブランチのリセット付き作成）も、間に挟まる他のフラグも見る
NEW_BRANCH_RE='(checkout([[:space:]]+-[^[:space:]]+)*[[:space:]]+-[bB]|switch([[:space:]]+-[^[:space:]]+)*[[:space:]]+-[cC])'

newbranch=$(printf '%s' "$cmd" |
  grep -oE "(^|[[:space:]])git[[:space:]]+$NEW_BRANCH_RE[[:space:]]+[^[:space:];&|]+" |
  head -1 | awk '{print $NF}')
newbranch=$(unquote "$newbranch")

if [ -n "$newbranch" ]; then
  case "$newbranch" in
    feat/* | fix/* | refactor/* | chore/* | test/* | docs/* | release/* | hotfix/* | claude/*) ;;
    *)
      deny "ブランチ命名規則違反です: $newbranch。feat/ fix/ refactor/ chore/ test/ docs/ release/ hotfix/ のいずれかで始めてください。"
      ;;
  esac

  # プレフィックスの後ろはケバブケース（小文字英数字とハイフン）。
  # release/hotfix はバージョン表記（1.0.0 / 1.0.0-rc1）を使うためドットも許す。
  branch_name=${newbranch#*/}
  case "$newbranch" in
    claude/*) ;; # ハーネスが生成するリモートセッション用ブランチは対象外
    release/* | hotfix/*)
      printf '%s' "$branch_name" | grep -Eq '^[a-z0-9]+([.-][a-z0-9]+)*$' ||
        deny "ブランチ名が命名規則に合いません: $newbranch。release/ hotfix/ の後ろはバージョン表記（例: release/1.0.0）にしてください。"
      ;;
    *)
      printf '%s' "$branch_name" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$' ||
        deny "ブランチ名はケバブケース（小文字英数字とハイフン区切り）にしてください: $newbranch。例: feat/user-profile、チケット番号があれば feat/123-user-profile"
      ;;
  esac

  # 最新の remote 情報を持たずに切ると、進行中の release/* を見落として
  # 何ヶ月も古い土台の上で作業を始めてしまう
  gitdir=$(git rev-parse --git-dir 2>/dev/null)
  fetch_hint="先に次を実行して、進行中のリリースを確認してください:
  git fetch origin --prune && git branch -r --list 'origin/release/*'"

  if [ ! -e "$gitdir/FETCH_HEAD" ]; then
    deny "このリポジトリでまだ一度も fetch していません。$fetch_hint"
  # find が使えない環境では鮮度を判定できないので、ブロックせず通す
  elif fresh=$(find "$gitdir/FETCH_HEAD" -mmin -15 2>/dev/null) && [ -z "$fresh" ]; then
    deny "直近15分以内に fetch していません。git branch -a はローカルの参照しか表示しないため、$fetch_hint"
  fi

  # 分岐元は production（例外: QA 修正の fix/* は release/* から切る）
  # 分岐元はブランチ名より後ろの「最初の非フラグトークン」。そう決めないと
  # git checkout -b docs/example -q の -q を分岐元と誤認してしまう。
  newbranch_re=$(printf '%s' "$newbranch" | sed 's|[^a-zA-Z0-9_/-]|\\&|g')
  base=$(printf '%s' "$cmd" |
    grep -oE "$NEW_BRANCH_RE[[:space:]]+\"?'?$newbranch_re'?\"?([[:space:]]+[^[:space:];&|]+)*" |
    head -1 |
    awk '{ stage = 0
           for (i = 1; i <= NF; i++) {
             # -b / -B / -c / -C の次の非フラグがブランチ名、その次が分岐元
             if (stage == 0) { if ($i ~ /^-[bBcC]$/) stage = 1; continue }
             if (substr($i, 1, 1) == "-") continue
             if (stage == 1) { stage = 2; continue }
             print $i; exit
           } }')
  # 同一コマンド内で production へ切り替えてから分岐する（ドキュメントの手順）ケースを
  # 現在ブランチ起点と誤判定しないよう、チェーンの前半を分岐元として扱う
  if [ -z "$base" ] && has '(^|[[:space:]])git[[:space:]]+(checkout|switch)[[:space:]]+production([[:space:]]|$|&|;)'; then
    base="production"
  fi
  [ -z "$base" ] && base="$current"
  base=${base#origin/}
  base=${base#refs/heads/}

  case "$newbranch" in
    claude/*) ;;
    fix/*)
      case "$base" in
        production | release/*) ;;
        *) deny "fix/* は production または release/* から切ってください（現在の分岐元: $base）。" ;;
      esac
      ;;
    *)
      if [ "$base" != "production" ]; then
        deny "作業ブランチは production から切ってください（現在の分岐元: $base）。release/* から切るとそのリリース行きに固定され、次のリリースへ回す選択ができなくなります。
  git checkout production && git pull && git checkout -b $newbranch"
      fi
      ;;
  esac
fi

exit 0
