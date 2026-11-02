import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { labNotesEvalDataDir } from './config.js';

/** Draft preview links are staff convenience, not a security boundary. 30 days. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type PreviewTokenRow = {
	token: string;
	documentId: string;
	slug: string;
	createdAt: string;
	expiresAt: string;
};

type Store = { tokens: PreviewTokenRow[] };

function ttlMs(): number {
	const raw = process.env.LAB_NOTES_PREVIEW_TTL_MS;
	if (raw) {
		const n = Number(raw);
		if (Number.isFinite(n) && n > 0) return n;
	}
	return DEFAULT_TTL_MS;
}

async function storePath() {
	const dir = labNotesEvalDataDir();
	await mkdir(dir, { recursive: true });
	return join(dir, 'preview-tokens.json');
}

async function readStore(): Promise<Store> {
	try {
		const raw = await readFile(await storePath(), 'utf8');
		return JSON.parse(raw) as Store;
	} catch {
		return { tokens: [] };
	}
}

async function writeStore(store: Store) {
	await writeFile(await storePath(), JSON.stringify(store, null, 2));
}

function prune(store: Store, now: number) {
	store.tokens = store.tokens.filter((row) => new Date(row.expiresAt).getTime() > now);
}

export async function mintBlogPostPreviewToken(
	documentId: string,
	slug: string
): Promise<{ token: string; expiresAt: string }> {
	const now = Date.now();
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(now + ttlMs()).toISOString();
	const store = await readStore();
	prune(store, now);
	store.tokens = store.tokens.filter((row) => row.documentId !== documentId);
	store.tokens.push({
		token,
		documentId,
		slug,
		createdAt: new Date(now).toISOString(),
		expiresAt
	});
	await writeStore(store);
	return { token, expiresAt };
}

export function validatePreviewTokenRow(
	token: string,
	row: PreviewTokenRow | undefined,
	now = Date.now()
): PreviewTokenRow | null {
	if (!row || row.token !== token) return null;
	if (new Date(row.expiresAt).getTime() <= now) return null;
	return row;
}

export async function resolvePreviewToken(
	token: string,
	now = Date.now()
): Promise<PreviewTokenRow | null> {
	if (!token) return null;
	const store = await readStore();
	prune(store, now);
	const row = store.tokens.find((t) => t.token === token);
	return validatePreviewTokenRow(token, row, now);
}

export async function resolvePreviewTokenForSlug(
	slug: string,
	token: string,
	now = Date.now()
): Promise<PreviewTokenRow | null> {
	const row = await resolvePreviewToken(token, now);
	if (!row || row.slug !== slug) return null;
	return row;
}

/** Back-compat for `/preview/[slug]?capability=` (capability === preview token). */
export async function validatePreviewCapability(slug: string, token: string): Promise<boolean> {
	const row = await resolvePreviewTokenForSlug(slug, token);
	return row != null;
}

/** @deprecated use mintBlogPostPreviewToken */
export async function mintPreviewCapability(slug: string, documentId: string) {
	return mintBlogPostPreviewToken(documentId, slug);
}
