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
        echo "error: fix the ownership/permissions of the mounted volume so nexus can write to it, or set RUN_AS_ROOT=1 to run explicitly as root" >&2
        exit 1
    fi
}

if [ "$(id -u)" -eq 0 ]; then
    ensure_runtime_dir /var/lib/wgapp
    ensure_runtime_dir /var/log/wg

    if ! command -v setpriv >/dev/null 2>&1; then
        echo "error: setpriv is required to drop privileges to nexus; set RUN_AS_ROOT=1 to explicitly allow running as root" >&2
        exit 1
    fi

    if setpriv --reuid nexus --regid nexus --init-groups sh -c 'test -w /var/lib/wgapp && test -w /var/log/wg'; then
        exec setpriv --reuid nexus --regid nexus --init-groups "$@"
    fi

    echo "error: unable to start as nexus because /var/lib/wgapp and/or /var/log/wg are not writable by nexus; refusing to continue as root. Set RUN_AS_ROOT=1 to explicitly allow running as root" >&2
    exit 1
fi

exec "$@"