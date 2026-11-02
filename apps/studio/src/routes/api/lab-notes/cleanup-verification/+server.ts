import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { requireLabNotesStaffSession } from '$lib/lab-notes-eval/staff-auth';
import { siteContext } from '$lib/server/site';
import { systemContext } from '@aphexcms/cms-core/local-api/auth-helpers';

/** Deletes only `verification-*` blog_post rows via Local API (staff session). Does not touch imported corpus. */
export const POST: RequestHandler = async ({ locals }) => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	await requireLabNotesStaffSession(locals);
	const { orgId } = await siteContext(locals);
	const localAPI = locals.aphexCMS.localAPI;
	const ctx = { ...systemContext(orgId), overrideAccess: true };
	const draftCtx = { ...ctx, perspective: 'draft' as const };
	const found = await localAPI.collections.blog_post.find(draftCtx, {
		limit: 50,
		where: { slug: { starts_with: 'verification-' } }
	});
	let removed = 0;
	for (const doc of found.docs) {
		const id = doc.id;
		if (!id) continue;
		try {
			await localAPI.collections.blog_post.unpublish(ctx, id);
		} catch {
			/* draft-only */
		}
		await localAPI.collections.blog_post.delete(ctx, id);
		removed += 1;
	}
	return json({ success: true, removed });
};

export const GET: RequestHandler = () => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	error(405, 'Method Not Allowed');
};
