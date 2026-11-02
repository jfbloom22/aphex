import type { RequestHandler } from '@sveltejs/kit';
import { oAuthProtectedResourceMetadata } from 'better-auth/plugins';
import { auth } from '$lib/server/auth';
import { labNotesServiceEnabled } from '$lib/lab-notes-eval/config';

const handler = oAuthProtectedResourceMetadata(auth);

export const GET: RequestHandler = ({ request }) => {
	if (!labNotesServiceEnabled()) return new Response('Not found', { status: 404 });
	return handler(request);
};
