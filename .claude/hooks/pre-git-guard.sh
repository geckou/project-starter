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
  BEGIN { SQ = sprintf("%c", 39); DQ = sprintf("%c", 34) }

  # 行の中から heredoc の開始を探し、マーカー名を返す（無ければ空）。
  # クォートの中・コメントの中の << は開始ではない。ここを見分けないと、
  # `echo "see <<EOF"` の 1 行で以降のコマンドが丸ごと検査から落ちる
  function heredoc_marker(line,   i, ch, state, rest, m, re, bs) {
    re = "^<<-?[[:space:]]*[" DQ SQ "]?[A-Za-z_][A-Za-z_0-9]*[" DQ SQ "]?"
    bs = sprintf("%c", 92)
    state = ""
    for (i = 1; i <= length(line); i++) {
      ch = substr(line, i, 1)
      # シングルクォートの中を除き、バックスラッシュは次の 1 文字を打ち消す。
      # 見落とすと `echo "see \" <<EOF"` の \" を閉じクォートと誤読し、
      # 引用の中の <<EOF を heredoc の開始として扱ってしまう
      if (ch == bs && state != SQ) { i++; continue }
      if (state != "") { if (ch == state) state = ""; continue }
      if (ch == SQ || ch == DQ) { state = ch; continue }
      if (ch == "#" && (i == 1 || substr(line, i - 1, 1) ~ /[ \t]/)) return ""
      if (ch != "<" || substr(line, i + 1, 1) != "<") continue
      # <<<"x"（here-string）は heredoc ではない
      if (substr(line, i + 2, 1) == "<") { i += 2; continue }
      rest = substr(line, i)
      if (match(rest, re)) {
        m = substr(rest, RSTART, RLENGTH)
        tab_ok = (substr(m, 1, 3) == "<<-")
        sub(/^<<-?[[:space:]]*/, "", m)
        gsub(DQ, "", m); gsub(SQ, "", m)
        return m
      }
      i++
    }
    return ""
  }

  # 終了マーカー行が実在するときだけ heredoc として扱う。終端の無い heredoc は
  # シェルでも構文エラーなので、実在しなければそれは heredoc ではない
  function has_terminator(from, mark, tabok,   j, l) {
    for (j = from; j <= total; j++) {
      l = lines[j]
      if (tabok) sub(/^\t+/, "", l)
      if (l == mark) return 1
    }
    return 0
  }

  { lines[NR] = $0; total = NR }

  END {
    in_body = 0
    for (i = 1; i <= total; i++) {
      if (in_body) {
        line = lines[i]
        # <<- 形式は終了マーカー行の先頭タブを許容する
        if (tab_ok) sub(/^\t+/, "", line)
        if (line == marker) in_body = 0
        continue
      }

      print lines[i]

      # 例外は 2 つ:
      #   - commit -m "$(cat <<EOF ...)" -> 本文はコミットメッセージなので検査する
      #   - sh / bash <<EOF ...          -> 本文は実際に実行されるので検査する
      if (lines[i] ~ /git[[:space:]]+commit/) continue
      if (lines[i] ~ /(^|[[:space:]|;&(])(sh|bash|zsh|dash|ksh)([[:space:]]|$)/) continue

      candidate = heredoc_marker(lines[i])
      if (candidate != "" && has_terminator(i + 1, candidate, tab_ok)) {
        marker = candidate
        in_body = 1
      }
    }
  }
')
# sh -c "…" / bash -c '…' / eval "…" の中身は実際に実行される。1 トークンのまま
# だと検査に当たらないので、引用を剥がしてサブシェル ( … ) として展開する。
# 外側が引用されている場合（コミットメッセージ中の言及）は展開しない
unwrap_pass() {
  awk '
    BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92) }

    # ANSI-C クォート（ドル記号 + 引用符）の中の空白のエスケープを元に戻す。
    # 戻さないと git\x20push のような書き方が 1 トークンのままで検査に当たらない
    function decode(text) {
      gsub(/\\x20|\\040|\\t|\\n/, " ", text)
      return text
    }
    {
      line = $0; out = ""; state = ""; n = length(line); i = 1
      while (i <= n) {
        ch = substr(line, i, 1)
        # バックスラッシュは次の 1 文字を打ち消す（シングルクォートの中を除く）
        if (ch == bs && state != sq) {
          out = out ch substr(line, i + 1, 1); i += 2; continue
        }
        if (state != "") { out = out ch; if (ch == state) state = ""; i++; continue }
        if (ch == sq || ch == dq) {
          # -lc / -cx のようにフラグを束ねた形、ANSI-C クォート形式、
          # /bin/sh のようなパス付きの呼び出しも同じ扱いにする
          if (out ~ /(^|[[:space:];&|(])[^[:space:];&|(]*(sh|bash|zsh|dash|ksh)[[:space:]]+-[A-Za-z]*c[A-Za-z]*[[:space:]]+\$?$/ ||
              out ~ /(^|[[:space:];&|(])eval[[:space:]]+\$?$/) {
            j = i + 1; inner = ""
            while (j <= n && substr(line, j, 1) != ch) { inner = inner substr(line, j, 1); j++ }
            if (j <= n) { out = out "( " decode(inner) " )"; i = j + 1; continue }
          }
          out = out ch; state = ch; i++; continue
        }
        out = out ch; i++
      }
      print out
    }
  '
}

# 入れ子（sh -c "eval '…'"）に備えて変化が無くなるまで繰り返す
unwrap_count=0
while [ "$unwrap_count" -lt 3 ]; do
  unwrapped=$(printf '%s' "$cmd" | unwrap_pass)
  [ "$unwrapped" = "$cmd" ] && break
  cmd=$unwrapped
  unwrap_count=$((unwrap_count + 1))
done

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
# セグメントの終端。改行を区切りにすると、クォートの中の改行（複数行のコミット
# メッセージ、commit -m の heredoc）でセグメントが割れてしまうため、区切りは
# 専用の行で表す
SEG_END=$(printf '\001.')
# 絞り込みループ（サブシェル）から親へ渡す印。変数は引き継げないため行として出す
MARK_DIR=$(printf '\001dir')
MARK_HOOKSPATH=$(printf '\001hookspath')
MARK_ENV_BYPASS=$(printf '\001envbypass')

# husky を環境変数から無効化する経路。HUSKY=0 は husky v9 が公式に用意した
# 無効化手段、GIT_CONFIG_* は -c を使わずに core.hooksPath を注入する経路
# （GIT_CONFIG_PARAMETERS は git 内部用だが、外から与えても効く）
ENV_BYPASS_RE='(HUSKY=0([[:space:]]|;|$)|GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+|PARAMETERS|GLOBAL|SYSTEM|NOSYSTEM)=)'

segments=$(printf '%s' "$cmd" | awk '
  BEGIN {
    sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92)
    bt = sprintf("%c", 96)
    sub_open = sprintf("%c(", 1); sub_close = sprintf("%c)", 1)
    seg_end = sprintf("%c.", 1)
  }
  # セグメントは改行を含みうるので、1 件ごとに終端の行を添えて渡す
  function emit(s) { print s; print seg_end }
  # 行末のバックスラッシュは行の継続。文字として残すと `git commit -m \` の
  # 次の行のメッセージが、値ではなく別のトークンとして読まれる
  function cont(i) { return (substr(all, i + 1, 1) == "\n") }
  { all = all $0 "\n" }
  END {
    q = ""; seg = ""; n = length(all)
    for (i = 1; i <= n; i++) {
      c = substr(all, i, 1)
      if (q == sq) { seg = seg c; if (c == sq) q = ""; continue }
      if (q == dq) {
        if (c == bs) { if (cont(i)) { i++; continue }
                       seg = seg c substr(all, i + 1, 1); i++; continue }
        seg = seg c
        if (c == dq) q = ""
        continue
      }
      if (c == bs) { if (cont(i)) { i++; continue }
                     seg = seg c substr(all, i + 1, 1); i++; continue }
      if (c == sq || c == dq) { q = c; seg = seg c; continue }
      if (c == "(" || c == ")") {
        emit(seg); seg = ""
        emit((c == "(") ? sub_open : sub_close)
        continue
      }
      # バッククォートも $( ) と同じくコマンド置換。区切らないと
      # `git push origin production` が前のコマンドの一部として埋もれる
      if (c == bt) {
        emit(seg); seg = ""
        emit(bt_open ? sub_close : sub_open)
        bt_open = 1 - bt_open
        continue
      }
      # 2>&1 や &> はリダイレクトであってコマンドの区切りではない。
      # 区切り扱いすると `git push 2>&1` が `git push 2>` になり判定から外れる
      if (c == "&" && (seg ~ />[[:space:]]*$/ || substr(all, i + 1, 1) == ">")) {
        seg = seg c
        continue
      }
      if (c == ";" || c == "\n" || c == "&" || c == "|") {
        emit(seg); seg = ""
        if ((c == "&" || c == "|") && substr(all, i + 1, 1) == c) i++
        continue
      }
      seg = seg c
    }
    emit(seg)
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
  buf=''

  # awk は 1 セグメントを「本体の行 + 終端の行」で渡す。行単位で読み直すと
  # クォートの中の改行でセグメントが割れ、commit -m の heredoc やコミット
  # メッセージの 2 行目以降が丸ごと検査から落ちる
  while IFS= read -r line; do
    if [ "$line" != "$SEG_END" ]; then
      buf=$buf$line$NL
      continue
    fi
    seg=${buf%"$NL"}
    buf=''

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

    if ! printf '%s' "$seg" | grep -Eq '(^|[[:space:]/])git([[:space:]]|$)'; then
      # 環境変数の設定は git とは別のセグメントに書ける（`export HUSKY=0; git commit`）。
      # git を含むセグメントだけを見ていると、この形の無効化が素通りする。
      # ただし後続へ効くのは export と代入だけのセグメントで、`HUSKY=0 yarn install`
      # のような 1 回限りの前置きは git に影響しない（CI で普通に使う形）。
      # 誤検出を避けるため、git を含まないセグメントの 1 行目だけを見る
      env_only=$(printf '%s' "$seg" | head -1 | tr -d "\"'")
      if printf '%s' "$env_only" | grep -Eqi "^export([[:space:]]+[^[:space:]]+)*[[:space:]]+$ENV_BYPASS_RE" ||
        { printf '%s' "$env_only" |
          grep -Eq '^([A-Za-z_][A-Za-z_0-9]*=[^[:space:]]*[[:space:]]*)+$' &&
          printf '%s' "$env_only" | grep -Eqi "$ENV_BYPASS_RE"; }; then
        printf '%s\n' "$MARK_ENV_BYPASS"
      fi
      continue
    fi

    # /usr/bin/git のような絶対パス呼び出しを `git` へ正規化する。
    # 以降の判定は全て `git <サブコマンド>` の形を見るため、ここで揃えないと
    # パス付きの呼び出しだけが検査を素通りする
    seg=$(printf '%s' "$seg" |
      sed -E 's#(^|[[:space:]])[^[:space:]]*/git([[:space:]]|$)#\1git\2#g')

    # クォートやバックスラッシュで書かれたフラグ（"-m" / '-c' / \-m /
    # --no\-verify）を素の形へ揃える。シェルはどれも同じフラグとして渡すが、
    # 揃えないとトークンの一致も `git <サブコマンド>` の形も外れ、
    # その書き方だけが検査を素通りする
    seg=$(printf '%s' "$seg" | awk '
      BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92) }

      # クォートとバックスラッシュを取り除いた形。フラグに見えなければ空を返す
      # （値まで含んだ形 "-m wip" や --message=feat:\ x はフラグではない）
      function flagform(t,   c, r, i, ch) {
        c = substr(t, 1, 1)
        if ((c == sq || c == dq) && length(t) > 2 && substr(t, length(t), 1) == c)
          t = substr(t, 2, length(t) - 2)
        r = ""
        for (i = 1; i <= length(t); i++) {
          ch = substr(t, i, 1)
          if (ch == bs && i < length(t)) { i++; ch = substr(t, i, 1) }
          r = r ch
        }
        return (r ~ /^-[^ \t]*$/) ? r : ""
      }

      function norm(t,   f) { f = flagform(t); return (f != "") ? f : t }

      {
        q = ""; tok = ""; out = ""; n = length($0)
        for (i = 1; i <= n; i++) {
          c = substr($0, i, 1)
          if (q == sq) { tok = tok c; if (c == sq) q = ""; continue }
          if (q == dq) {
            if (c == bs) { tok = tok c substr($0, i + 1, 1); i++; continue }
            tok = tok c
            if (c == dq) q = ""
            continue
          }
          if (c == bs) { tok = tok c substr($0, i + 1, 1); i++; continue }
          if (c == sq || c == dq) { q = c; tok = tok c; continue }
          if (c == " " || c == "\t") {
            if (tok != "") { out = out (out == "" ? "" : " ") norm(tok); tok = "" }
            continue
          }
          tok = tok c
        }
        if (tok != "") out = out (out == "" ? "" : " ") norm(tok)
        print out
      }
    ')

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
          # セグメントは複数行になりうる（commit -m の heredoc）。最初の git
          # 呼び出しだけを見ないと、メッセージ本文の `git -C /other` で
          # 検査対象から外れてしまう
          exit
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

    # -c core.hooksPath=... は husky（commitlint / lint-staged）を無効化する。
    # 下でグローバルオプションを剥がす前に見ないと素通りするが、セグメント全体の
    # 部分一致にすると `git commit -m 'docs: -c core.hooksPath について'` でも当たる。
    # サブコマンドより前に置かれた -c / --config-env の値だけを見る。
    # 設定キーは大文字小文字を区別しないので、比較も区別しない
    conf_values=$(printf '%s' "$seg" | awk '
      {
        for (i = 1; i <= NF; i++) {
          if ($i != "git") continue
          for (j = i + 1; j <= NF; j++) {
            t = $j
            if (substr(t, 1, 1) != "-") break
            if (t == "-c" || t == "--config-env") { print $(j + 1); j++; continue }
            if (t ~ /^--config-env=/) { sub(/^--config-env=/, "", t); print t; continue }
            if (t == "-C" || t == "--git-dir" || t == "--work-tree" ||
                t == "--namespace" || t == "--exec-path" || t == "--super-prefix") j++
          }
          exit
        }
      }
    ')
    if printf '%s\n' "$conf_values" | tr -d "\"'" | grep -qi '^core\.hookspath'; then
      printf '%s\n' "$MARK_HOOKSPATH"
    fi

    # 環境変数の前置きでも husky は無効化できる。HUSKY=0 は husky v9 が公式に用意した
    # 無効化手段、GIT_CONFIG_* は -c を使わずに core.hooksPath を注入する経路。
    # git より前のトークンだけを見る（メッセージ中の言及で誤検出しないため）
    # break ではなく exit なのは、セグメントが複数行になりうるため。行ごとに
    # 見ると、メッセージ本文の行が丸ごと「git より前のトークン」として扱われる
    env_prefix=$(printf '%s' "$seg" | awk '
      { for (i = 1; i <= NF; i++) { if ($i == "git") exit; print $i } }
    ')
    if printf '%s\n' "$env_prefix" | tr -d "\"'" |
      grep -Eqi "$ENV_BYPASS_RE"; then
      printf '%s\n' "$MARK_ENV_BYPASS"
    fi

    # git config core.hooksPath は husky を「永続的に」外す。-c の 1 回きりの
    # 上書きより強いので、同じ迂回として扱う。
    # セグメント全体の部分一致にすると、この設定について書いたコミットメッセージや
    # ドキュメントでも当たるため、トークンとして解析する。
    # 値を伴わない読み出し（git config core.hooksPath / --get）は変更しないので許す
    config_hookspath=$(printf '%s' "$seg" | awk '
      {
        for (i = 1; i <= NF; i++) {
          if ($i != "git") continue
          for (j = i + 1; j <= NF; j++) {
            t = $j
            if (substr(t, 1, 1) == "-") {
              if (t == "-c" || t == "--config-env" || t == "-C" ||
                  t == "--git-dir" || t == "--work-tree" || t == "--namespace" ||
                  t == "--exec-path" || t == "--super-prefix") j++
              continue
            }
            if (t != "config") exit
            # config の後ろ: フラグを読み飛ばし、キーと値の 2 つを見る
            key = ""; value = ""
            for (k = j + 1; k <= NF; k++) {
              t = $k
              if (substr(t, 1, 1) == "-") {
                if (t == "--file" || t == "-f" || t == "--blob") k++
                # 読み出し系のフラグが付いていれば変更ではない
                if (t == "--get" || t == "--get-all" || t == "--get-regexp" ||
                    t == "--list" || t == "-l" || t == "--unset" ||
                    t == "--unset-all") { key = ""; break }
                continue
              }
              if (key == "") { key = t; continue }
              value = t
              break
            }
            if (value != "") print key
            exit
          }
          exit
        }
      }
    ')
    if printf '%s\n' "$config_hookspath" | tr -d "\"'" |
      grep -qi '^core\.hookspath$'; then
      printf '%s\n' "$MARK_HOOKSPATH"
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
env_bypass=$(printf '%s\n' "$cmd" | grep -c "^$MARK_ENV_BYPASS$")
guard_dir=$(printf '%s\n' "$cmd" | sed -n "s/^$MARK_DIR//p" | head -1)
cmd=$(printf '%s\n' "$cmd" | grep -v "^$MARK_DIR" |
  grep -v "^$MARK_HOOKSPATH$" | grep -v "^$MARK_ENV_BYPASS$")

[ -n "$cmd" ] || exit 0

# --- 短縮フラグの束を 1 文字ずつに展開する ------------------------------
# git は `-am` のようにフラグを束ねて書ける。束のままだと -m / -F / -n の検出が
# 「単独トークンの -m」しか見ないため全て素通りし、コミット規約も -n 禁止も効かない。
# 値がくっついた形（-m"wip" / -am"wip"）もここで分離する。
# 束の中の -n はクォート内の文字列と区別できないと誤検出になるため、
# 展開時に印として出す（後段の正規表現では見ない）。
MARK_COMMIT_N=$(printf '\001commit-n')

cmd=$(printf '%s\n' "$cmd" | awk -v mark="$MARK_COMMIT_N" '
  BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92) }

  # -m / -F / -t は次のトークンを値として取る（束ねた -am も末尾の文字で見る）
  function takes_value(p) {
    if (p ~ /^-[A-Za-z]*[mFt]$/) return 1
    if (substr(p, 1, 2) != "--" || length(p) < 3) return 0
    p = substr(p, 3)
    return (substr("message", 1, length(p)) == p ||
      substr("file", 1, length(p)) == p ||
      substr("template", 1, length(p)) == p)
  }

  # `--` より後ろはパススペック、-m / -F / -t の次はその値。どちらもフラグでは
  # ないので展開しない（`-- -node` を `-n` の指定と読んでしまうため）
  function normalize(t,   res) {
    if (past_dd || takes_value(prev)) { prev = t; return t }
    if (t == "--") { past_dd = 1; prev = t; return t }
    res = expand(t)
    prev = t
    return res
  }

  # -am -> -a -m、-m"wip" -> -m "wip"。値や `--` 付きの長いオプションは触らない
  function expand(t,   j, letters, rest, k, res) {
    if (t !~ /^-[A-Za-z]/) return t
    j = 2
    while (j <= length(t) && substr(t, j, 1) ~ /[A-Za-z]/) j++
    letters = substr(t, 2, j - 2)
    rest = substr(t, j)
    res = ""
    for (k = 1; k <= length(letters); k++) {
      if (substr(letters, k, 1) == "n") saw_n = 1
      res = res (res == "" ? "" : " ") "-" substr(letters, k, 1)
    }
    if (rest != "") res = res " " rest
    return res
  }

  {
    line = $0
    if (line !~ /git[ \t]+(commit|push)([ \t]|$)/) { print line; next }

    is_commit = (line ~ /git[ \t]+commit([ \t]|$)/)
    saw_n = 0
    q = ""; tok = ""; out = ""; prev = ""; past_dd = 0; n = length(line)

    for (i = 1; i <= n; i++) {
      c = substr(line, i, 1)
      if (q == sq) { tok = tok c; if (c == sq) q = ""; continue }
      if (q == dq) {
        # ダブルクォートの中では \" は閉じクォートではない。ここを見落とすと
        # 以降のトークン分割が 1 つずれ、行の残りが丸ごと 1 トークンになる
        if (c == bs) { tok = tok c substr(line, i + 1, 1); i++; continue }
        tok = tok c
        if (c == dq) q = ""
        continue
      }
      if (c == bs) { tok = tok c substr(line, i + 1, 1); i++; continue }
      if (c == sq || c == dq) { q = c; tok = tok c; continue }
      if (c == " " || c == "\t") {
        if (tok != "") { out = out (out == "" ? "" : " ") normalize(tok); tok = "" }
        continue
      }
      tok = tok c
    }
    if (tok != "") out = out (out == "" ? "" : " ") normalize(tok)

    print out
    if (is_commit && saw_n) print mark
  }
')

commit_n_bundle=$(printf '%s\n' "$cmd" | grep -c "^$MARK_COMMIT_N$")
cmd=$(printf '%s\n' "$cmd" | grep -v "^$MARK_COMMIT_N$")

[ -n "$cmd" ] || exit 0

# --- コミットメッセージの値を除いた「コマンドとして書かれたトークン」 --------
# 迂回・push 先・ブランチ名の検出は、メッセージの中身を見てはいけない。
# `-m 'docs: --no-verify を禁じた理由'` のような説明を書いただけで止まってしまう。
# 複数行のメッセージ（と commit -m の heredoc）は本文がそのまま残るため、
# 素の $cmd を見ていると本文の 1 行が git コマンドとして読まれる。
# メッセージの値そのものを見る判定（規約の検証・-F のパス）は $cmd を使う
cmd_flags=$(printf '%s\n' "$cmd" | awk '
  BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34); bs = sprintf("%c", 92) }

  # -m / --message（一意でない前方一致も含む。git が弾くかはここでは問わない）
  function is_message(t) {
    return (t == "-m" || (substr(t, 1, 2) == "--" && length(t) > 2 &&
      substr("message", 1, length(t) - 2) == substr(t, 3)))
  }

  { all = all $0 "\n" }

  END {
    # クォート・バックスラッシュを保ったままトークンへ分割する。
    # 改行はトークンの区切りであると同時に、行の区切りとして覚えておく
    # （行をまたいで `git push` と `production` が繋がらないようにするため）
    n = 0; q = ""; tok = ""; len = length(all)
    for (i = 1; i <= len; i++) {
      c = substr(all, i, 1)
      if (q == sq) { tok = tok c; if (c == sq) q = ""; continue }
      if (q == dq) {
        # \" は閉じクォートではない。見落とすと本物の閉じクォートが開きとして
        # 読まれ、残りのコマンド全体が -m の値として消える
        if (c == bs) { tok = tok c substr(all, i + 1, 1); i++; continue }
        tok = tok c
        if (c == dq) q = ""
        continue
      }
      if (c == bs) { tok = tok c substr(all, i + 1, 1); i++; continue }
      if (c == sq || c == dq) { q = c; tok = tok c; continue }
      if (c == " " || c == "\t" || c == "\n") {
        if (tok != "") { T[++n] = tok; eol[n] = 0 }
        if (c == "\n" && n > 0) eol[n] = 1
        tok = ""
        continue
      }
      tok = tok c
    }
    if (tok != "") { T[++n] = tok; eol[n] = 0 }

    # -m は commit のときだけメッセージを取る。switch / checkout の -m は
    # --merge なので、値として次のトークン（-c <ブランチ名>）を落としてはいけない。
    # サブコマンドは「git の後ろの最初の非フラグトークン」で判定する。ただの
    # `commit` という語（`git push origin commit` の refspec 等）に引きずられると、
    # 後続の本物の git commit を丸ごと隠せてしまう
    out = ""; drop = 0; is_commit = 0; in_git = 0; skip_val = 0
    for (i = 1; i <= n; i++) {
      t = T[i]
      if (drop) {
        drop = 0
      } else {
        if (t == "git") { in_git = 1; skip_val = 0; is_commit = 0 }
        else if (in_git) {
          if (skip_val) skip_val = 0
          else if (substr(t, 1, 1) == "-") {
            if (t == "-C" || t == "-c" || t == "--git-dir" || t == "--work-tree" ||
                t == "--namespace" || t == "--exec-path" || t == "--super-prefix" ||
                t == "--config-env") skip_val = 1
          } else { is_commit = (t == "commit"); in_git = 0 }
        }
        e = index(t, "=")
        if (is_commit && e > 1 && substr(t, 1, 1) == "-" &&
            is_message(substr(t, 1, e - 1)))
          t = substr(t, 1, e)
        else if (is_commit && is_message(t))
          drop = 1
        out = out (out == "" ? "" : " ") t
      }
      # 行をまたいで値を食べない（`git commit -m ; git push …` の git が消える）
      if (eol[i]) {
        print out
        out = ""; drop = 0; is_commit = 0; in_git = 0; skip_val = 0
      }
    }
    if (out != "") print out
  }
')

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

has() { printf '%s' "$cmd_flags" | grep -Eq "$1"; }

current=$(git -C "${guard_dir:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null)

# --- 検証のスキップ禁止 -------------------------------------------------
# lint-staged（pre-commit のフォーマット / lint）を迂回されると壊れたコードが入る。
# commitlint 側は警告のみだが、迂回すればメッセージ規約への気付きも失われる。
# git は長いオプションを一意な前方一致で受けるため、--no-verif のような略記でも
# 検証は飛ぶ。--no-ver / --no-verb は --no-verbose と曖昧で git 自身が弾くので、
# --no-verify だけに一意に定まる --no-veri 以降を対象にする
if { has '(^|[[:space:]])git[[:space:]]+(commit|push)' && has '(^|[[:space:]])--no-veri[a-z]*([[:space:]]|$)'; } ||
  [ "${commit_n_bundle:-0}" -gt 0 ]; then
  deny '--no-verify / commit -n による検証スキップは禁止です。pre-commit の lint-staged（フォーマット / lint）まで飛ばしてしまうため、失敗したら迂回せず原因を直してください。'
fi

if [ "${hooks_path_bypass:-0}" -gt 0 ]; then
  deny 'core.hooksPath による husky の無効化は禁止です（-c での上書き、git config での永続設定のどちらも --no-verify と同じ迂回）。失敗したら迂回せず原因を直してください。'
fi

if [ "${env_bypass:-0}" -gt 0 ]; then
  deny 'HUSKY=0 / GIT_CONFIG_* の前置きによる husky の無効化は禁止です（--no-verify と同じ迂回）。失敗したら迂回せず原因を直してください。'
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
  # -m / --message の「値」を取り出して先頭行だけを見る。コマンド全体から type を
  # 探す形だと `git commit -m 'wip' -m 'feat: x'` のように、2 つ目に規約どおりの
  # メッセージを置くだけで通ってしまう（git が使うのは 1 つ目）。
  # git は長いオプションを一意な前方一致で受けるため `--mes` のような略記も拾う
  msg_raw=$(printf '%s\n' "$cmd" | awk '
    BEGIN {
      sq = sprintf("%c", 39); dq = sprintf("%c", 34)
      bs = sprintf("%c", 92); mark = sprintf("%c", 1)
    }

    # tok が full の一意な前方一致か（other にも一致するなら git 自身が曖昧として弾く）
    function isabbrev(tok, full, other,   t) {
      if (substr(tok, 1, 2) != "--") return 0
      t = substr(tok, 3)
      if (t == "") return 0
      if (substr(full, 1, length(t)) != t) return 0
      if (other != "" && substr(other, 1, length(t)) == t) return 0
      return 1
    }

    # 前後のクォートを剥がす。閉じクォートが無い場合は開きだけを剥がす
    # （クォートを閉じ忘れたコマンドでも、先頭行は検証できるため）
    function unq(v,   c) {
      c = substr(v, 1, 1)

      if (c != sq && c != dq) return v
      if (length(v) > 1 && substr(v, length(v), 1) == c)
        return substr(v, 2, length(v) - 2)

      return substr(v, 2)
    }

    { all = all $0 "\n" }

    END {
      if (all !~ /git[ \t]+commit([ \t\n]|$)/) exit

      # クォート・バックスラッシュを保ったままトークンへ分割する
      n = 0; q = ""; tok = ""; len = length(all)
      for (i = 1; i <= len; i++) {
        c = substr(all, i, 1)
        if (q == sq) { tok = tok c; if (c == sq) q = ""; continue }
        if (q == dq) {
          # \" は閉じクォートではない
          if (c == bs) { tok = tok c substr(all, i + 1, 1); i++; continue }
          tok = tok c
          if (c == dq) q = ""
          continue
        }
        if (c == bs) { tok = tok c substr(all, i + 1, 1); i++; continue }
        if (c == sq || c == dq) { q = c; tok = tok c; continue }
        if (c == " " || c == "\t" || c == "\n") {
          if (tok != "") T[++n] = tok
          tok = ""
          continue
        }
        tok = tok c
      }
      if (tok != "") T[++n] = tok

      seen = 0
      for (i = 1; i <= n; i++) {
        t = T[i]
        if (!seen) { if (t == "commit") seen = 1; continue }
        if (t == "--") break
        if (t == "-m" || t == "--message" || isabbrev(t, "message", "")) {
          printf "%s%s", mark, (i < n ? unq(T[i + 1]) : "")
          exit
        }
        e = index(t, "=")
        if (e > 1 && substr(t, 1, 1) == "-") {
          name = substr(t, 1, e - 1)
          if (name == "--message" || isabbrev(name, "message", "")) {
            printf "%s%s", mark, unq(substr(t, e + 1))
            exit
          }
        }
      }
    }
  ')

  if [ -n "$msg_raw" ]; then
    msg_val=${msg_raw#?}
    case "$msg_val" in
      *'$'* | *'`'*)
        # 変数・コマンド置換はフックからは展開できない。
        # commit -m "$(cat <<'EOF' ...)" は本文がコマンド文字列に現れるので、
        # heredoc の最初の非空行（= 件名。git の既定の cleanup が先頭の空行を
        # 落とすため）だけを検証する。どの行でもよいことにすると、件名が規約違反
        # でも本文に type らしい行を置くだけで通ってしまう
        subject=$(printf '%s\n' "$msg_val" | awk '
          NR == 1 && /<<-?[[:space:]]*["'"'"']?[A-Za-z_][A-Za-z_0-9]*/ { body = 1; next }
          body && $0 !~ /^[[:space:]]*$/ { print; exit }
        ')

        if [ -n "$subject" ]; then
          printf '%s\n' "$subject" |
            grep -Eq "^($TYPES)(\([^)]+\))?: [^[:space:]]" || deny "$msg_ng"
        else
          # heredoc ではない置換（-m "$(build-msg)"）は値を取り出せない。
          # コマンド全体から type を探すことしかできない
          printf '%s' "$cmd" |
            grep -Eq "(^|[[:space:]\"'=])($TYPES)(\([^)]+\))?:(\\\\)?[[:space:]][^[:space:]]" ||
            deny "$msg_ng"
        fi
        ;;
      *)
        # `--message=feat:\ x` のように、シェルのエスケープ付きで渡される形も通す
        printf '%s\n' "$msg_val" | sed -n '1p' | sed 's/\\ / /g' |
          grep -Eq "^($TYPES)(\([^)]+\))?: [^[:space:]]" || deny "$msg_ng"
        ;;
    esac
  fi

  # --fil 以降は --file に一意（--fi は --fixup と曖昧で git 自身が弾く）
  if has '(^|[[:space:]])(-F|--fil[a-z]*)([[:space:]]|=|$)'; then
    # クォート付きの値は閉じクォートまでを 1 引数として取る（cd の処理と同じ方針）。
    # 空白までで切ると `-F "my file.txt"` が `"my` になり、分かりにくいエラーで止まる
    msg_file=$(printf '%s' "$cmd" |
      grep -oE "(^|[[:space:]])(-F|--fil[a-z]*)[[:space:]=]+(\"[^\"]*\"|'[^']*'|[^[:space:];&|]+)" |
      head -1 | sed -E 's/.*(-F|--fil[a-z]*)[[:space:]=]+//')
    msg_file=$(unquote "$msg_file")

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
  # （--te 以降は --template に一意。--t は --trailer と曖昧で git 自身が弾く）
  if has '(^|[[:space:]])(-t|--te[a-z]*)([[:space:]]|=)'; then
    deny "-t / --template は使用できません。メッセージを事前に検証できないため、-m または -F でメッセージを渡してください。"
  fi
fi

# --- push ---------------------------------------------------------------
if has '(^|[[:space:]])git[[:space:]]+push'; then
  # --all / --mirror は refspec を書かずに全ブランチ（production を含む）を更新する。
  # 宛先を 1 つずつ解決する下の判定では拾えないので、ここで落とす
  if has '(^|[[:space:]])git[[:space:]]+push[^|;&]*[[:space:]](--all|--mirror)([[:space:]]|$)'; then
    deny 'git push --all / --mirror は禁止です（production を含む全ブランチを更新するため）。push するブランチを明示してください。'
  fi

  # push の宛先ブランチを refspec から取り出す。
  # `git push` / `git push origin` / `git push origin HEAD` はどれも現在ブランチが
  # 宛先になるため、文字列に production が現れなくても production への push になる。
  # 各行を「<force か> <宛先>」で出す（宛先が現在ブランチなら @CURRENT）
  push_targets=$(printf '%s\n' "$cmd_flags" | awk '
    BEGIN { sq = sprintf("%c", 39); dq = sprintf("%c", 34) }

    # 前後のクォートを 1 組だけ剥がす
    function strip(v,   c) {
      c = substr(v, 1, 1)
      if (c == sq || c == dq) v = substr(v, 2)
      c = substr(v, length(v), 1)
      if (length(v) > 0 && (c == sq || c == dq)) v = substr(v, 1, length(v) - 1)
      return v
    }

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
              $i == "--receive-pack" || $i == "--exec") i++
          continue
        }

        if (!remote_seen) { remote_seen = 1; continue }

        refspecs++
        dst = $i
        # クォートを剥がしてから解析する。剥がさないと `git push origin "production"`
        # や HEAD:production をクォートで囲んだ形が production と一致せず素通りする。
        # :dst 側にもクォートが残る形に備えて、分割の前後で剥がす
        dst = strip(dst)
        if (index(dst, ":") > 0) dst = substr(dst, index(dst, ":") + 1)
        dst = strip(dst)
        # 先頭の + は force push そのもの。heads/ を剥がす前に外さないと
        # +heads/production が production と一致せず素通りする
        if (sub(/^\+/, "", dst)) force = 1
        # git は heads/production も refs/heads/production に解決する（DWIM）
        sub(/^(refs\/)?heads\//, "", dst)
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
# -B / -C（既存ブランチのリセット付き作成）も、間に挟まる他のフラグも見る。
# checkout -b / switch -c 以外にも、`git branch <名前>` と
# `git worktree add -b <名前>` でブランチは作れる（どちらも素通りしていた）。
# 短縮形だけでなく長い形（--create / --orphan）も見る。
# worktree add はパスとフラグの語順が自由なので、-b の前に非フラグが来る形も許す。
# `git branch` は直後が非フラグのときだけ作成（-d / -m / --list 等は別の操作）
NEW_BRANCH_RE='(checkout([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-[bB]|--orphan)|switch([[:space:]]+-[^[:space:]]+)*[[:space:]]+(-[cC]|--create|--orphan)|worktree[[:space:]]+add([[:space:]]+[^[:space:];&|]+)*[[:space:]]+-[bB])'

# `git branch <名前> [<分岐元>]` もブランチを作る。直後が非フラグのときだけ対象に
# する（-d / -D / -m / -r / --list 等はブランチを作らない別の操作）。
# ただし作成の意味を変えないフラグ（--track / -f / -q 等）は間に挟まりうるので、
# それらは読み飛ばす。挟まった形だけ命名・分岐元の検査が素通りしていた
# -l は git 2.19 以降 --list（作成しない）なので入れない
BRANCH_CREATE_FLAG='(-f|--force|-q|--quiet|-t|--track(=[^[:space:];&|]+)?|--no-track|--create-reflog|--recurse-submodules)'
PLAIN_BRANCH_RE="branch([[:space:]]+$BRANCH_CREATE_FLAG)*[[:space:]]+[^-[:space:];&|][^[:space:];&|]*([[:space:]]+[^-[:space:];&|][^[:space:];&|]*)?"

# --orphan は「親を持たないブランチ」を作る。分岐元の検査は下で行うが、そこへ渡す
# 分岐元が無いので現在ブランチへフォールバックし、production 上で実行すると
# 「production から切った」ように見えて実際には何も継承していない状態が通ってしまう。
# 検査のしようがないので、書き方として禁じる
if has '(^|[[:space:]])git[[:space:]]+(checkout|switch)([[:space:]]+-[^[:space:]]+)*[[:space:]]+--orphan([[:space:]]|$)'; then
  deny "--orphan は分岐元を持たないブランチを作るため使用できません（全てのブランチは production から切る）。
  git checkout production && git pull && git checkout -b <名前>"
fi

newbranch=$(printf '%s' "$cmd_flags" |
  grep -oE "(^|[[:space:]])git[[:space:]]+$NEW_BRANCH_RE[[:space:]]+[^[:space:];&|]+" |
  head -1 | awk '{print $NF}')

plain_branch=''
if [ -z "$newbranch" ]; then
  plain_branch=$(printf '%s' "$cmd_flags" |
    grep -oE "(^|[[:space:]])git[[:space:]]+$PLAIN_BRANCH_RE" | head -1)
  # フラグが挟まると位置が動くので、branch の後ろの「最初の非フラグ」を名前とする
  newbranch=$(printf '%s' "$plain_branch" | awk '{ nonflag = 0
    for (i = 1; i <= NF; i++) {
      if (!seen) { if ($i == "branch") seen = 1; continue }
      if (substr($i, 1, 1) == "-") continue
      if (++nonflag == 1) { print $i; exit }
    } }')
fi

# `git worktree add <パス>`（-b 無し）は basename(パス) の名前でブランチを作る。
# <パス> の後ろに既存のコミット / ブランチを書いた形は作成ではないので対象外
if [ -z "$newbranch" ]; then
  newbranch=$(printf '%s' "$cmd_flags" | awk '
    { seen_git = 0; seen_worktree = 0; seen_add = 0
      creates = 1; nonflag = 0; path = ""
      for (i = 1; i <= NF; i++) {
        # 実際の `git worktree add` だけを見る。行のどこかの worktree から
        # 走査すると、`git log --grep worktree add ../x` のような引数でも
        # ブランチ作成と誤認する
        if (!seen_git) { if ($i == "git") seen_git = 1; continue }
        if (!seen_worktree) {
          if ($i == "worktree") { seen_worktree = 1; continue }
          if (substr($i, 1, 1) == "-") continue
          break
        }
        if (!seen_add) { if ($i == "add") seen_add = 1; else break; continue }
        if ($i ~ /^(-[bB]|--detach|--orphan)$/) { creates = 0; break }
        if ($i == "--reason") { i++; continue }
        if (substr($i, 1, 1) == "-") continue
        if (++nonflag == 1) { path = $i; continue }
        # <パス> の次の非フラグは既存の commit-ish
        creates = 0
        break
      }
      if (seen_add && creates && nonflag == 1) {
        sub(/\/+$/, "", path)
        sub(/^.*\//, "", path)
        print path
        exit
      }
      # 見つからなければ次の行（＝次のセグメント）を見る。
      # ここで exit すると `git status && git worktree add ../x` が素通りする
    }')
fi

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
  # git -C <別 worktree> のときはそちらの FETCH_HEAD を見る（セッション側ではない）
  gitdir=$(git -C "${guard_dir:-.}" rev-parse --git-dir 2>/dev/null)
  case $gitdir in
    /*) ;;
    *) gitdir=$(cd "${guard_dir:-.}" 2>/dev/null && cd "$gitdir" 2>/dev/null && pwd -P) ;;
  esac
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
  base=$(printf '%s' "$plain_branch" | awk '{ nonflag = 0
    for (i = 1; i <= NF; i++) {
      if (!seen) { if ($i == "branch") seen = 1; continue }
      if (substr($i, 1, 1) == "-") continue
      if (++nonflag == 2) { print $i; exit }
    } }')
  [ -n "$base" ] || base=$(printf '%s' "$cmd_flags" |
    grep -oE "$NEW_BRANCH_RE[[:space:]]+\"?'?$newbranch_re'?\"?([[:space:]]+[^[:space:];&|]+)*" |
    head -1 |
    awk '{ stage = 0; is_wt = 0; seen_add = 0; path_before = 0
           for (i = 1; i <= NF; i++) {
             # -b / -B / -c / -C（と長い形）の次の非フラグがブランチ名、その次が分岐元
             if (stage == 0) {
               if ($i == "worktree") { is_wt = 1; continue }
               if (is_wt && $i == "add") { seen_add = 1; continue }
               if ($i ~ /^(-[bBcC]|--create|--orphan)$/) { stage = 1; continue }
               # worktree add のパスが -b より前に来た語順
               if (seen_add && substr($i, 1, 1) != "-") path_before = 1
               continue
             }
             if (substr($i, 1, 1) == "-") continue
             if (stage == 1) { stage = 2; continue }
             # worktree add は <path> [<commit-ish>] の順。パスを分岐元と誤認しない
             if (is_wt && !path_before && stage == 2) { stage = 3; continue }
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
