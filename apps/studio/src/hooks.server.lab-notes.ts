import type { Handle } from '@sveltejs/kit';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { ensureLabNotesEvalIdentities } from '$lib/lab-notes-eval/ensure-identities.server';

/** No-store + no-referrer on private draft preview responses. */
export const labNotesPreviewHeadersHook: Handle = async ({ event, resolve }) => {
	if (labNotesEvalEnabled()) {
		void ensureLabNotesEvalIdentities(event.locals.aphexCMS.databaseAdapter).catch((err) => {
			console.error('[lab-notes-eval] ensure identities:', err);
		});
	}
	if (labNotesEvalEnabled() && event.url.pathname.startsWith('/preview/')) {
		const response = await resolve(event);
		response.headers.set('cache-control', 'no-store');
		response.headers.set('referrer-policy', 'no-referrer');
		return response;
	}
	return resolve(event);
};
