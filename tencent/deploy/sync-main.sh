#!/usr/bin/env bash
set -euo pipefail

home=/opt/pixelhoops
app=$home/app
releases=$home/releases
mirror=$home/main.git
previous=$releases/previous
rejected=$releases/.rejected
upstream=https://github.com/CrimsonCecil/PixelHoops.git
local_http=http://127.0.0.1:8787
mode=${1:-sync}
[[ $mode == sync || $mode == rollback || $mode == rollback-original ]] || exit 2
static_dir=$(sed -n 's/^STATIC_DIR=//p' /etc/pixelhoops.env | tail -n 1)
case $static_dir in
    ''|"$app"|"$app"/) ;;
    *) echo "Unsupported STATIC_DIR: $static_dir" >&2; exit 2 ;;
esac

exec 9>/run/lock/pixelhoops-sync.lock
flock -n 9
as_app() { runuser -u pixelhoops -- "$@"; }
current=$(realpath -e "$app")
stage=
link=$home/.app-link
trap 'rm -f -- "$link"; if [[ -n $stage ]]; then rm -rf -- "$stage"; fi' EXIT

publish() {
    ln -s -- "$1" "$link"
    mv -Tf -- "$link" "$app"
}

refresh_static() {
    local target=$1 outgoing=$2 stamp pack
    stamp=$(date +%s)
    if [[ $(stat -c %Y "$outgoing/index.html") == "$stamp" ]]; then
        sleep 1
        stamp=$(date +%s)
    fi
    # Voice packs use unversioned URLs; on rollback their archived mtime alone would allow a stale 304.
    for pack in "$target"/vo/p/*.mp3; do
        [[ -f $pack ]] || continue
        if ! cmp -s "$pack" "$outgoing/vo/p/${pack##*/}"; then
            as_app touch -d "@$stamp" -- "$pack" || return 1
        fi
    done
    as_app touch -d "@$stamp" -- "$target/index.html"
}

check_live() {
    curl -fsS --max-time 5 --retry 3 --retry-connrefused "$local_http/api/health" |
        grep -Eq '"ok":[[:space:]]*true' || return 1
    [[ -z $static_dir ]] && return 0
    curl -fsS --max-time 10 "$local_http/js/game.js" | cmp -s - "$1/js/game.js" &&
        curl -fsS --max-time 10 "$local_http/js/main.js" | cmp -s - "$1/js/main.js"
}

install -d -m 0755 "$releases"
install -d -m 0700 "$rejected"
if [[ $mode != sync ]]; then
    if [[ $mode == rollback-original ]]; then
        original=("$releases"/legacy-*)
        [[ ${#original[@]} == 1 ]]
        next=$(realpath -e "${original[0]}")
    else
        next=$(realpath -e "$previous")
    fi
    [[ $next == "$releases/"* && $next != "$current" ]]
else
    if [[ ! -d $mirror ]]; then
        install -d -o pixelhoops -g pixelhoops -m 0750 "$mirror"
        as_app git init -q --bare "$mirror"
    fi
    git_main() { as_app env GIT_TERMINAL_PROMPT=0 git --git-dir="$mirror" "$@"; }
    git_main fetch -q --depth=1 "$upstream" +refs/heads/main:refs/heads/main
    sha=$(git_main rev-parse --verify 'refs/heads/main^{commit}')
    if [[ $current == "$releases/$sha" ]]; then
        echo "Already serving main $sha"
        exit 0
    fi
    if [[ -e $rejected/$sha ]]; then
        echo "Skipping main $sha: previous activation failed" >&2
        exit 0
    fi

    next=$releases/$sha
    if [[ ! -d $next ]]; then
        stage=$(mktemp -d "$releases/.stage.XXXXXXXX")
        chown pixelhoops:pixelhoops "$stage"
        chmod 0755 "$stage"
        git_main archive "$sha" | as_app tar -xf - -C "$stage"
        if cmp -s "$current/tencent/package-lock.json" "$stage/tencent/package-lock.json" &&
            [[ -d $current/tencent/node_modules/ws ]]; then
            as_app cp -a "$current/tencent/node_modules" "$stage/tencent/"
        else
            as_app npm --prefix "$stage/tencent" ci --omit=dev --ignore-scripts --no-audit --no-fund
        fi
        test -s "$stage/index.html" && test -s "$stage/js/game.js" && test -s "$stage/js/main.js"
        as_app node --check "$stage/js/game.js"
        as_app node --check "$stage/js/main.js"
        mv -T -- "$stage" "$next"
        stage=
    fi
fi

restart=0
for path in tencent/server.mjs tencent/lib tencent/package.json tencent/package-lock.json worker; do
    if ! diff -qr "$current/$path" "$next/$path" >/dev/null; then restart=1; break; fi
done
if (( restart )) && [[ $mode == sync ]]; then as_app node "$next/tencent/test/run.mjs"; fi
if [[ -n $static_dir ]]; then refresh_static "$next" "$current"; fi

if [[ ! -L $app ]]; then
    old=$(as_app git -C "$app" rev-parse HEAD)
    current=$releases/legacy-$old
    mv -T -- "$app" "$current"
    if ! publish "$next"; then mv -T -- "$current" "$app"; exit 1; fi
else
    publish "$next"
fi

if { (( ! restart )) || systemctl restart pixelhoops.service; } && check_live "$next"; then
    ln -sfnT -- "$current" "$previous"
    echo "Serving $next; rollback available at $current"
else
    echo "Health check failed; reverting to $current" >&2
    if [[ $mode == sync ]]; then
        : > "$rejected/$sha" || echo "Could not record rejected release $sha" >&2
    fi
    if [[ -n $static_dir ]]; then
        refresh_static "$current" "$next" || echo "Could not refresh static timestamps while reverting" >&2
    fi
    publish "$current"
    if (( restart )); then systemctl restart pixelhoops.service; fi
    check_live "$current"
    exit 1
fi

# Preserve the original installation, the previous build, and any still-running backend's working tree.
pid=$(systemctl show -p MainPID --value pixelhoops.service)
running_dir=$(readlink -f "/proc/$pid/cwd" || :)
for dir in "$releases/"*; do
    if [[ ${dir##*/} =~ ^[a-f0-9]{40}$ && $dir != "$next" && $dir != "$current" &&
          $running_dir != "$dir/"* ]]; then
        rm -rf -- "$dir"
    fi
done
