#!/bin/sh

set -eu

if [ "${RUN_AS_ROOT:-0}" = "1" ]; then
    exec "$@"
fi

ensure_runtime_dir() {
    path="$1"
    if [ ! -d "$path" ]; then
        mkdir -p "$path"
    fi
    chown nexus:nexus "$path"
}

if [ "$(id -u)" -eq 0 ]; then
    ensure_runtime_dir /var/lib/wgapp
    ensure_runtime_dir /var/log/wg
    exec setpriv --reuid nexus --regid nexus --init-groups "$@"
fi

exec "$@"