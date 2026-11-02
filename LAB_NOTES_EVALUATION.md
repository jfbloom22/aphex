# SPR-071 Build variation 2 — Aphex Lab Notes eval

**Worktree:** `/Users/jfhome/devProjects/workplace-labs/aphex/.worktrees/lab-notes-aphex` (branch `lab-notes-aphex`).

**Reader:** http://127.0.0.1:5192/blog  
**MCP:** http://127.0.0.1:5192/mcp (API key in `apps/studio/.aphex/lab-notes-eval/mcp-api-key.txt`)  
**Server log:** `/tmp/lab-notes-aphex-server.log`  
**Stop:** `kill $(lsof -tiTCP:5192 -sTCP:LISTEN)`

## Three-way comparison

|             | V1 JSON POC                              | **V2 Aphex (this)**                                                             | V3 mdsvex plugins                                                        |
| ----------- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Port        | 5191                                     | **5192**                                                                        | **5193** blog, **5194** Vite preview                                     |
| Repo        | `wl-workspace/.../experiments/lab-notes` | **This worktree**                                                               | `wl-workspace/.worktrees/lab-notes-mdsvex/experiments/lab-notes-plugins` |
| Body import | Turndown markdown files                  | **Ghost HTML → `@portabletext/html`** (`scripts/lab-notes/html-to-content.mjs`) | mdsvex markdown                                                          |

V3 is **not** default studio on 5173.

## HTML → Portable Text (content fidelity)

Import no longer uses Turndown or a hand-rolled markdown splitter. Ghost `post.html` is converted with **`@portabletext/html`** (`htmlToPortableText` + JSDOM `parseHtml`), schema aligned to Aphex block defaults (styles, `strong`/`em`, lists, `link` annotations). Custom **`deserialize` rules** only for Lab Notes blocks:

- `runPrompt` (26 placeholders via `data-wl-block="runPrompt"`)
- `fluencyLevelPicker` (visual lab draft)

`@portabletext/block-tools` is the Sanity-schema wrapper around the same engine; this eval uses `@portabletext/html` directly (recommended when not on Sanity schemas). See [block-tools README](https://www.npmjs.com/package/@portabletext/block-tools).

**Tests:** `pnpm lab-notes:test-converter` (node:test fixture + real export link sample).  
**Live check:** `pnpm lab-notes:verify` asserts every http(s) href in Ghost body HTML appears as a `.blog-link` in rendered article prose (nav/tag links excluded).

## Metadata the importer writes

- **`postDate`:** calendar date from Ghost `published_at`. The full timestamp is `importSource.sourcePublishedAt`. A top-level `publishedAt` is reserved and crashes boot.
- **Authors:** first Ghost author is `author`. Further authors are `coAuthors`. Bios and avatars are not invented when the export lacks them.
- **SEO / OG:** Ghost meta title, description, and OG image are copied onto `seo` when the export has them. The website still applies its empty-field fallbacks.

## Setup

```bash
cd /Users/jfhome/devProjects/workplace-labs/aphex/.worktrees/lab-notes-aphex
pnpm install && pnpm turbo build --filter=@aphexcms/studio^...
cd apps/studio
cp .env.lab-notes.example .env.lab-notes
set -a && source .env.lab-notes && set +a && ADAPTER=node pnpm build
python3 scripts/lab-notes/start-prod.py   # prints PID
# Mint MCP key → .aphex/lab-notes-eval/mcp-api-key.txt (see prior doc section)
pnpm lab-notes:test-converter
pnpm lab-notes:import
pnpm lab-notes:verify
pnpm lab-notes:smoke-mcp
pnpm check
```

## Publish permission (H1)

`publishGate`, the JSON approval file, and `/staff/review` are removed. The person publishes in the Aphex admin. OAuth tokens used by the agent omit `document.publish`, so `publish_document` and `create` or `update` with `publish: true` fail. An admin session for the same person can still publish.

**Staff identity (local eval only):** `ensure-identities.server.ts` creates `lab-notes-staff-a@eval.local`, `lab-notes-staff-b@eval.local`, and `lab-notes-outsider@eval.local`. Those accounts are local. They are not production users. The two-person Open WebUI rehearsal is deferred.

## Fixture cleanup

`POST /api/lab-notes/cleanup-verification` (staff **session** cookie) deletes **only** slug prefix `verification-*` via Local API. Archive is not slug-filtered.

## Last verification (2026-11-02)

| Command                                       | Result                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm -F @aphexcms/cms-core test`             | 223/223                                                                                                                  |
| `pnpm lab-notes:verify`                       | ok: 17 articles, 17 covers, 26 prompts, OAuth staff tokens, publish denied on the OAuth token, admin session can publish |
| `pnpm lab-notes:import-prove`                 | every export post accounted for; a second import skips a local edit                                                      |
| `./scripts/lab-notes/podman-runtime.sh prove` | `/blog` HTTP 200 on `127.0.0.1:5196` as uid 10001, then the container is removed                                         |

Preview URL from MCP `preview_draft_url`: `https://www.workplacelabs.io/blog/<slug>/?preview=<token>`. The token lasts 30 days. Override the public origin with `LAB_NOTES_PUBLIC_ORIGIN`.

## Cross-repo deps

- Ghost export is fetched at import time from the website env (`GHOST_URL`, `GHOST_CONTENT_API_KEY` in `workplace-labs-web/.env`). Do not point scripts at the deleted `experiments/lab-notes` export.
- Public reader: `workplace-labs-web/.worktrees/lab-notes-reader` (`dc055e8`). It loads Aphex only when `LAB_NOTES_APHEX_ORIGIN` is set.
- Compose scaffold, not a deploy: `workplace-ai-toolkit/.worktrees/spr071-lab-notes-runtime/services/lab-notes/` (`d6a983f`).
- V1 **5191** and V3 mdsvex **5193/5194** were comparison ports. Do not restart them for this MVP.

## Durability (backup, restore drill, fork upgrade)

**Online backup (5192 keeps serving):** uses SQLite `.backup` so WAL is consolidated into a consistent file; uploads are copied in the same snapshot.

```bash
cd apps/studio
set -a && source .env.lab-notes && set +a
node scripts/lab-notes/backup-restore.mjs backup
# → writes apps/studio/.aphex/lab-notes-eval/snapshots/<timestamp>/
#    (lab-notes-eval.db + uploads/ + manifest.json)
```

**Restore check (5195 only, 5192 untouched):**

```bash
node scripts/lab-notes/backup-restore.mjs restore-proof
# Boots a throwaway copy under .aphex/lab-notes-eval/restore-drill/<timestamp>/,
# curls published JSON + a /media/ URL, then stops 5195.
pnpm lab-notes:backup-restore   # backup + restore-proof + rollback-proof + RSS sample
```

**Version rollback proof:** `rollback-proof` creates a disposable `blog_post`, edits, restores an older native version, deletes the document (requires live **5192** + MCP write key).

**5192 RSS sample (one shot, KB):** `node scripts/lab-notes/backup-restore.mjs rss` — records `ps` RSS for the process listening on 5192 (or `LAB_NOTES_LIVE_PID`). Not a VPS sizing claim.

**Fork upgrade path (eval / worktree, not production deploy):**

1. Pin the fork (branch/commit) you want on the VPS or laptop worktree.
2. `pnpm install` at repo root; `pnpm turbo build --filter=@aphexcms/studio^...`
3. `cd apps/studio && set -a && source .env.lab-notes && set +a && pnpm lab-notes:build`
4. Recreate the process: stop the old listener on **5192** only (`kill $(lsof -tiTCP:5192 -sTCP:LISTEN)`), then start again (`nohup pnpm lab-notes:start >> /tmp/lab-notes-5192.log 2>&1 &`, poll `/blog` → 200).
5. Re-run `node scripts/lab-notes/backup-restore.mjs restore-proof` after any schema migration if you changed the DB layout.

## Podman runtime (production-style, port 5196)

Eval **5192 stays the live host process** — this path is a separate container on **127.0.0.1:5196** for rehearsal only.

The image is **pre-built staging**, not a full monorepo `pnpm build` inside Docker: `pnpm deploy --filter=@aphexcms/studio --prod --legacy` into `apps/studio/.aphex/lab-notes-podman/staging`, then copy the current `apps/studio/build` (from `pnpm lab-notes:build`). `Dockerfile.lab-notes-studio` grafts Alpine `sharp@0.35.3` and `@libsql/linux-arm64-musl` over the macOS bindings from that deploy. Do not use `podman build --no-cache`. The Podman machine is 6 GiB and a cacheless build exhausts the host.

The app container runs as **uid 10001** with a **1g** memory cap. Secrets stay out of the image (runtime `--env-file apps/studio/.env.lab-notes` plus overrides). Each run copies the eval DB with SQLite `.backup` and copies uploads into `.aphex/lab-notes-podman/run-*`. The live 5192 files are not mounted writable. macOS cannot `chown` to uid 10001, so `podman-runtime.sh` runs a one-off Alpine container as root to chown that temp copy, then starts the app as `10001:10001`. Do not run the app as root. Podman ignores the Dockerfile `HEALTHCHECK`.

```bash
cd apps/studio
set -a && source .env.lab-notes && set +a
pnpm lab-notes:build   # if build/ changed
./scripts/lab-notes/podman-runtime.sh prove   # build → run on 5196 → curl /blog → stop & rm
# Image: localhost/aphex-lab-notes-runtime:eval
```

**Rollback after a bad container upgrade:** stop the container (`./scripts/lab-notes/podman-runtime.sh stop`), restore filesystem state with `node scripts/lab-notes/backup-restore.mjs restore-proof` (or replace `.aphex/lab-notes-eval.db` + uploads from a snapshot under `.aphex/lab-notes-eval/snapshots/`), then `./scripts/lab-notes/podman-runtime.sh prove` again. Host **5192** is unchanged unless you restart it separately.

Measured **5192** Node RSS was about **466 MiB** during the durability drill — a data point only, not a VPS sizing recommendation.
