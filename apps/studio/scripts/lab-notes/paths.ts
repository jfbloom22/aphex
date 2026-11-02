import { join } from 'node:path';

export function labNotesEvalDataDir(): string {
	return process.env.LAB_NOTES_DATA_DIR ?? join(process.cwd(), '.aphex', 'lab-notes-eval');
}
