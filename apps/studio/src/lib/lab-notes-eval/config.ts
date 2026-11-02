import { env } from '$env/dynamic/private';
import { join } from 'node:path';

function envFlag(name: string): boolean {
	const bag = env as Record<string, string | undefined>;
	const value = bag[name] ?? process.env[name] ?? '';
	return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
}

/** Local eval only. Seeds the known eval users. Never set this on a public host. */
export function labNotesEvalEnabled(): boolean {
	return envFlag('LAB_NOTES_EVAL');
}

/**
 * Public JSON, preview tokens, draft media, and MCP draft links.
 * `LAB_NOTES_PUBLIC` turns those on without seeding eval identities.
 */
export function labNotesServiceEnabled(): boolean {
	return labNotesEvalEnabled() || envFlag('LAB_NOTES_PUBLIC');
}

export function labNotesEvalOrigin(): string {
	return env.AUTH_URL || env.LAB_NOTES_ORIGIN || 'http://127.0.0.1:5192';
}

/** Local staff publish confirmation (not production identity). */
export function labNotesStaffToken(): string {
	return env.LAB_NOTES_STAFF_TOKEN ?? 'local-staff-dev-token';
}

/** Where eval-only JSON sidecars live (preview capabilities, import manifest). */
export function labNotesEvalDataDir(): string {
	return env.LAB_NOTES_DATA_DIR ?? join(process.cwd(), '.aphex', 'lab-notes-eval');
}

export const LAB_NOTES_TOPIC_SLUGS = [
	'work-design',
	'ai-fluency',
	'building-with-ai',
	'evidence-and-value',
	'people-and-teams'
] as const;

export function authorizeStaffRequest(request: Request): boolean {
	const expected = labNotesStaffToken();
	const header = request.headers.get('authorization');
	if (header?.startsWith('Bearer ') && header.slice(7) === expected) return true;
	const url = new URL(request.url);
	return url.searchParams.get('staff_token') === expected;
}
