import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { requirePreviewTokenMinter } from '$lib/lab-notes-eval/preview-mint-auth';
import { resolveLabNotesRequestAuth } from '$lib/lab-notes-eval/request-auth';
import { mintBlogPostPreviewToken } from '$lib/lab-notes-eval/preview-tokens';
import { labNotesPreviewViewUrl } from '$lib/lab-notes-eval/public-origin';
import { siteContext } from '$lib/server/site';
import { systemContext } from '@aphexcms/cms-core/local-api/auth-helpers';
import { z } from 'zod';

const bodySchema = z.object({
	documentId: z.string().min(1).optional(),
	slug: z.string().min(1).optional()
});

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	const auth = await resolveLabNotesRequestAuth(locals, request);
	requirePreviewTokenMinter(auth);
	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) error(400, 'documentId or slug required');
	const { orgId } = await siteContext(locals);
	const draftCtx = {
		...systemContext(orgId),
		overrideAccess: true,
		perspective: 'draft' as const
	};
	const col = locals.aphexCMS.localAPI.collections.blog_post;
	if (!col) error(500, 'blog_post collection missing');

	let doc: { id: string; slug?: string } | undefined;
	if (parsed.data.documentId) {
		doc = (await col.get(draftCtx, { id: parsed.data.documentId })) as typeof doc;
	} else if (parsed.data.slug) {
		const found = await col.find(draftCtx, {
			limit: 1,
			where: { slug: { equals: parsed.data.slug } }
		});
		doc = found.docs[0] as typeof doc;
	}
	if (!doc?.id) error(404, 'Draft not found');
	const slug = typeof doc.slug === 'string' ? doc.slug : parsed.data.slug;
	if (!slug) error(400, 'Document has no slug');

	const { token, expiresAt } = await mintBlogPostPreviewToken(doc.id, slug);
	return json({
		success: true,
		data: {
			token,
			expiresAt,
			documentId: doc.id,
			slug,
			viewUrl: labNotesPreviewViewUrl(slug, token)
		}
	});
};

export const GET: RequestHandler = () => {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	error(405, 'Method Not Allowed');
};
