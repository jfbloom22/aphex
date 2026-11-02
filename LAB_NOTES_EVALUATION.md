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

## Metadata limitations (honest)

- **`postDate`:** date portion of Ghost `published_at` only (no time-of-day in schema field).
- **Authors:** first Ghost author → `author` reference; bios/avatars not backfilled from export unless present in CMS.
- **SEO / OG:** `@aphexcms/plugin-seo` fields not populated from Ghost meta; no claim of pixel-perfect SEO or social card parity with production Ghost.

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

## Human approval gate (SPR-071 H1 spike)

**Core patch:** `CMSConfig.publishGate` runs on every native publish path (`CollectionAPI.publish`, `create`/`update` with `publish: true`, including scheduled publish). It is **not** skipped when `overrideAccess` is true. When unset, core behavior is unchanged.

**Eval wiring:** With `LAB_NOTES_EVAL=true`, `aphex.config.ts` registers a gate that requires a single-use staff approval for **`blog_post` only**, stored in `.aphex/lab-notes-eval/publish-approvals.json`.

| Action                           | Who                                                                                                     | Result                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Approve draft revision           | Signed-in staff session (`document.publish`) via `/staff/review` or `POST /api/lab-notes/staff-publish` | Creates approval for `(documentId, revision)` |
| Publish                          | MCP / HTTP / scheduled job                                                                              | Consumes matching approval or fails closed    |
| MCP `approved` / `approvalToken` | Agent                                                                                                   | Ignored — not enforcement                     |

**Staff identity (local eval only):** On first request, the server ensures three Better Auth users (see `.aphex/lab-notes-eval/eval-identities.json`): `staffA` and `staffB` (org `editor`, can approve) and `outsider` (no org membership). Shared bearer tokens and MCP API keys are **not** people — keys are org-scoped automation credentials without a user id.

**Not in this spike:** Open WebUI identity mapping, production SSO, or production readiness.

**Later check:** Per-user Open WebUI identity must map onto these staff principals; one shared MCP key must not substitute for multi-user approval.

## Fixture cleanup

`POST /api/lab-notes/cleanup-verification` (staff **session** cookie) deletes **only** slug prefix `verification-*` via Local API. Archive is not slug-filtered.

## Last verification (2026-11-02)

| Command                                                            | Result                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| `APHEX_DATABASE=sqlite pnpm vitest run tests/publish-gate.test.ts` | 3/3 pass                                                        |
| `pnpm lab-notes:test-converter`                                    | 4/4 pass                                                        |
| `pnpm lab-notes:verify`                                            | ok (approval gate + corpus checks)                              |
| Server PID (5192)                                                  | restart after gate deploy (see `lsof -tiTCP:5192 -sTCP:LISTEN`) |

Example preview (token expires): mint via MCP `preview_draft_url` for `native-svelte-visual-lab`.

## Cross-repo deps

- Export + media: `wl-workspace/.worktrees/lab-notes-alternative/experiments/lab-notes/data/`
- V1 **5191**; V3 mdsvex **5193/5194**

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

The image is **pre-built staging**, not a full monorepo `pnpm build` inside Docker: `pnpm deploy --filter=@aphexcms/studio --prod --legacy` into `apps/studio/.aphex/lab-notes-podman/staging`, then copy the current `apps/studio/build` (from `pnpm lab-notes:build`). See repo-root `Dockerfile.lab-notes-studio` (includes `npm rebuild sharp` for Alpine). Non-root **uid 10001**, **1g** memory cap, no secrets in the image (runtime `--env-file apps/studio/.env.lab-notes` plus overrides). Each run takes an online **`sqlite3 .backup`** copy of the eval DB plus a copy of uploads into a temp dir under `.aphex/lab-notes-podman/run-*` so the live **5192** files are not written.

```bash
cd apps/studio
set -a && source .env.lab-notes && set +a
pnpm lab-notes:build   # if build/ changed
./scripts/lab-notes/podman-runtime.sh prove   # build → run on 5196 → curl /blog → stop & rm
# Image: localhost/aphex-lab-notes-runtime:eval
```

**Rollback after a bad container upgrade:** stop the container (`./scripts/lab-notes/podman-runtime.sh stop`), restore filesystem state with `node scripts/lab-notes/backup-restore.mjs restore-proof` (or replace `.aphex/lab-notes-eval.db` + uploads from a snapshot under `.aphex/lab-notes-eval/snapshots/`), then `./scripts/lab-notes/podman-runtime.sh prove` again. Host **5192** is unchanged unless you restart it separately.

Measured **5192** Node RSS was about **466 MiB** during the durability drill — a data point only, not a VPS sizing recommendation.
