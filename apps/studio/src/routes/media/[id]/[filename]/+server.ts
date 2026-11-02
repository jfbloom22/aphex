import { serveAssetCDN } from '@aphexcms/cms-core/server';
import { labNotesEvalEnabled } from '$lib/lab-notes-eval/config';
import { assertPreviewMediaAccess } from '$lib/lab-notes-eval/preview-media-access';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	if (labNotesEvalEnabled()) {
		const denied = await assertPreviewMediaAccess(event);
		if (denied) return denied;
	}
	return serveAssetCDN(event);
};
