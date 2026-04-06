#!/usr/bin/env bash

set -euo pipefail

if [[ -f "${PWD}/compose.prod.yml" ]]; then
	REPO_DIR="$PWD"
else
	REPO_DIR="/home/ubuntu/wg"
fi

cd "$REPO_DIR"

if [[ -f .env ]]; then
	set -a
	source .env
	set +a
fi

if [[ "${ENABLE_SECURITY_SIDECARS:-false}" == "true" ]]; then
	export COMPOSE_PROFILES=security
else
	unset COMPOSE_PROFILES
fi

compose_cmd=(/usr/bin/podman-compose -f compose.prod.yml)
action="${1:-up}"

case "$action" in
	up)
		exec "${compose_cmd[@]}" up -d
		;;
	down)
		exec "${compose_cmd[@]}" down
		;;
	restart)
		"${compose_cmd[@]}" down
		exec "${compose_cmd[@]}" up -d
		;;
	*)
		echo "Usage: $0 {up|down|restart}" >&2
		exit 2
		;;
esac