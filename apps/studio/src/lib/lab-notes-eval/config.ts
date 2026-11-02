import { env } from '$env/dynamic/private';
import { join } from 'node:path';

/** SPR-071 Aphex eval mode — separate SQLite DB, port 5192, Lab Notes public skin. */
export function labNotesEvalEnabled(): boolean {
	return ['true', '1', 'yes', 'on'].includes(
		(env.LAB_NOTES_EVAL ?? process.env.LAB_NOTES_EVAL ?? '').toLowerCase()
	);
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
