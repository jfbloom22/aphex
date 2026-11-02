#!/bin/sh
# Lab Notes eval runtime — no secrets here; env from mount or `podman run -e`.
set -e

if [ -z "$ORIGIN" ] && [ -n "$AUTH_URL" ]; then
	export ORIGIN="$AUTH_URL"
fi

if [ -z "$AUTH_SECRET" ] && [ -z "$BETTER_AUTH_SECRET" ]; then
	echo "[lab-notes-runtime] AUTH_SECRET is required at runtime (not baked into the image)." >&2
	exit 1
fi

case "$(echo "$APHEX_DATABASE" | tr '[:upper:]' '[:lower:]')" in
	postgres | postgresql)
		if [ "$APHEX_SKIP_MIGRATE" != "true" ]; then
			node node_modules/@aphexcms/cms-core/dist/cli/index.js migrate
		fi
		;;
	*)
		;;
esac

exec "$@"
