import type { RequestHandler } from '@sveltejs/kit';
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import { auth } from '$lib/server/auth';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';

const handler = oAuthProtectedResourceMetadata(auth);

export const GET: RequestHandler = ({ request }) => {
	if (!labNotesEvalEnabled()) return new Response('Not found', { status: 404 });
	return handler(request);
};
