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
    if ! chown nexus:nexus "$path" 2>/dev/null; then
        echo "warning: unable to chown $path for nexus; keeping current ownership" >&2
    fi
}

if [ "$(id -u)" -eq 0 ]; then
    ensure_runtime_dir /var/lib/wgapp
    ensure_runtime_dir /var/log/wg

    if setpriv --reuid nexus --regid nexus --init-groups sh -c 'test -w /var/lib/wgapp && test -w /var/log/wg'; then
        exec setpriv --reuid nexus --regid nexus --init-groups "$@"
    fi

    echo "warning: runtime directories are not writable by nexus; starting as root" >&2
    exec "$@"
fi

exec "$@"