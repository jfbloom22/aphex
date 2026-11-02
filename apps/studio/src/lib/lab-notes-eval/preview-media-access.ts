import type { RequestEvent } from '@sveltejs/kit';
import { collectAssetIdsUnstructured } from '@aphexcms/cms-core/utils/asset-reference-walk';
import { systemContext } from '@aphexcms/cms-core/local-api/auth-helpers';
import { labNotesEvalEnabled } from './config';
import { resolvePreviewToken } from './preview-tokens';

/**
 * Draft-only blog_post assets require `?preview=<token>` valid for a referencing document.
 * Returns a Response when access must be denied; null to continue to the CDN handler.
 */
export async function assertPreviewMediaAccess(event: RequestEvent): Promise<Response | null> {
	if (!labNotesEvalEnabled()) return null;

	const assetId = event.params.id;
	if (!assetId) return null;

	const { databaseAdapter, localAPI } = event.locals.aphexCMS;
	const orgs = await databaseAdapter.findAllOrganizations();
	const orgId = orgs[0]?.id;
	if (!orgId) return null;

	const previewParam = event.url.searchParams.get('preview') ?? '';

	const refs = databaseAdapter.findDocumentsReferencingAsset
		? await databaseAdapter.findDocumentsReferencingAsset(orgId, assetId, ['blog_post'])
		: [];

	if (!refs.length) return null;

	const col = localAPI.collections.blog_post;
	if (!col) return null;

	const baseCtx = { ...systemContext(orgId), overrideAccess: true };
	let inPublished = false;
	const draftDocIds: string[] = [];

	for (const ref of refs) {
		let draftDoc: Record<string, unknown> | null = null;
		let pubDoc: Record<string, unknown> | null = null;
		try {
			draftDoc = (await col.get(
				{ ...baseCtx, perspective: 'draft' },
				{ id: ref.documentId }
			)) as Record<string, unknown> | null;
		} catch {
			/* missing */
		}
		try {
			pubDoc = (await col.get(
				{ ...baseCtx, perspective: 'published' },
				{ id: ref.documentId }
			)) as Record<string, unknown> | null;
		} catch {
			/* never published */
		}
		const draftIds = collectAssetIdsUnstructured(draftDoc ?? {});
		const pubIds = collectAssetIdsUnstructured(pubDoc ?? {});
		if (pubIds.has(assetId)) inPublished = true;
		if (draftIds.has(assetId)) draftDocIds.push(ref.documentId);
	}

	if (inPublished) return null;
	if (!draftDocIds.length) return null;

	if (!previewParam) {
		return new Response('Preview token required for draft media', { status: 401 });
	}

	const row = await resolvePreviewToken(previewParam);
	if (!row || !draftDocIds.includes(row.documentId)) {
		return new Response('Invalid or expired preview token', { status: 401 });
	}

	return null;
}

/** Append preview query to injected `/media/` asset URLs in API payloads. */
export function appendPreviewToMediaUrls(value: unknown, previewToken: string): unknown {
	if (!previewToken) return value;
	if (typeof value === 'string' && value.startsWith('/media/')) {
		const url = new URL(value, 'https://placeholder.invalid');
		url.searchParams.set('preview', previewToken);
		return `${url.pathname}${url.search}`;
	}
	if (Array.isArray(value)) {
		return value.map((v) => appendPreviewToMediaUrls(v, previewToken));
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) {
			out[k] = appendPreviewToMediaUrls(v, previewToken);
		}
		return out;
	}
	return value;
}
