#!/usr/bin/env bash
# Lab Notes production-style runtime on Podman (127.0.0.1:5196 only).
# Does not touch ports 5190–5195 or the 5192 host process.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
STUDIO="$ROOT/apps/studio"
STAGE="$STUDIO/.aphex/lab-notes-podman/staging"
IMAGE="${LAB_NOTES_IMAGE:-localhost/aphex-lab-notes-runtime:eval}"
CONTAINER=lab-notes-runtime
HOST_PORT=5196
CONTAINER_PORT=3000
MEMORY="${LAB_NOTES_PODMAN_MEMORY:-1g}"
RUN_DATA=""

cd "$ROOT"

cmd="${1:-prove}"

prepare_run_data() {
	RUN_DATA="$(mktemp -d "$STUDIO/.aphex/lab-notes-podman/run-XXXXXX")"
	echo "[podman-runtime] snapshot db + uploads → $RUN_DATA (live eval db untouched)"
	sqlite3 "$STUDIO/.aphex/lab-notes-eval.db" ".backup '$RUN_DATA/lab-notes-eval.db'"
	chmod a+rw "$RUN_DATA/lab-notes-eval.db"
	cp -R "$STUDIO/.aphex/lab-notes-uploads" "$RUN_DATA/uploads"
	mkdir -p "$RUN_DATA/eval-sidecar"
	cp "$STUDIO/.aphex/lab-notes-eval/mcp-api-key.txt" "$RUN_DATA/eval-sidecar/" 2>/dev/null || true
}

cleanup_run_data() {
	if [[ -n "$RUN_DATA" && -d "$RUN_DATA" ]]; then
		rm -rf "$RUN_DATA"
		RUN_DATA=""
	fi
}

stage_bundle() {
	echo "[podman-runtime] staging production bundle (pnpm deploy --legacy)…"
	rm -rf "$STAGE"
	mkdir -p "$(dirname "$STAGE")"
	pnpm deploy --filter=@aphexcms/studio --prod --legacy "$STAGE"
	echo "[podman-runtime] syncing latest ADAPTER=node build output…"
	rm -rf "$STAGE/build"
	cp -R "$STUDIO/build" "$STAGE/build"
	# Never bake eval secrets into the image context used by COPY.
	rm -f "$STAGE/.env" "$STAGE/.env.lab-notes" "$STAGE/.env.lab-notes.example" "$STAGE/.env.example" 2>/dev/null || true
}

build_image() {
	stage_bundle
	podman build -f Dockerfile.lab-notes-studio -t "$IMAGE" .
}

run_container() {
	local env_file="$STUDIO/.env.lab-notes"
	if [[ ! -f "$env_file" ]]; then
		echo "Missing $env_file — copy from .env.lab-notes.example" >&2
		exit 1
	fi

	prepare_run_data

	podman rm -f "$CONTAINER" 2>/dev/null || true

	podman run -d \
		--name "$CONTAINER" \
		--user 0:0 \
		--memory="$MEMORY" \
		--publish "127.0.0.1:${HOST_PORT}:${CONTAINER_PORT}" \
		--env-file "$env_file" \
		-e "HOST=0.0.0.0" \
		-e "PORT=${CONTAINER_PORT}" \
		-e "ORIGIN=http://127.0.0.1:${HOST_PORT}" \
		-e "AUTH_URL=http://127.0.0.1:${HOST_PORT}" \
		-e "AUTH_TRUSTED_ORIGINS=http://127.0.0.1:${HOST_PORT}" \
		-e "LAB_NOTES_EVAL=true" \
		-e "APHEX_DATABASE=sqlite" \
		-e "APHEX_SQLITE_URL=file:/data/lab-notes-eval.db" \
		-e "APHEX_UPLOADS_DIR=/data/uploads" \
		-e "APHEX_SEED=false" \
		-e "LAB_NOTES_DATA_DIR=/data/eval-sidecar" \
		-v "$RUN_DATA:/data:Z" \
		"$IMAGE"
}

wait_blog() {
	local url="http://127.0.0.1:${HOST_PORT}/blog"
	for _ in $(seq 1 60); do
		code="$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "$url" 2>/dev/null || true)"
		if [[ "$code" == "200" ]]; then
			echo "$code"
			return 0
		fi
		sleep 1
	done
	echo "000"
	return 1
}

stop_container() {
	podman stop "$CONTAINER" 2>/dev/null || true
	podman rm -f "$CONTAINER" 2>/dev/null || true
	cleanup_run_data
}

case "$cmd" in
	build)
		build_image
		echo "{\"ok\":true,\"image\":\"$IMAGE\",\"note\":\"pre-built staging bundle\"}"
		;;
	run)
		build_image
		run_container
		code="$(wait_blog)" || true
		echo "{\"ok\":true,\"image\":\"$IMAGE\",\"blogHttp\":$code,\"port\":$HOST_PORT}"
		;;
	prove)
		build_image
		run_container
		trap stop_container EXIT
		code="$(wait_blog)"
		if [[ "$code" != "200" ]]; then
			podman logs "$CONTAINER" 2>&1 | tail -30 >&2 || true
			exit 1
		fi
		stop_container
		trap - EXIT
		echo "{\"ok\":true,\"image\":\"$IMAGE\",\"blogHttp\":200,\"port\":$HOST_PORT,\"container\":\"stopped\"}"
		;;
	stop)
		stop_container
		echo '{"ok":true,"container":"removed"}'
		;;
	*)
		echo "Usage: $0 {build|run|prove|stop}" >&2
		exit 2
		;;
esac
