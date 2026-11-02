import { error } from '@sveltejs/kit';
import { hasCapability } from '@aphexcms/cms-core';
import { authToContext } from '@aphexcms/cms-core/local-api/auth-helpers';
import { labNotesEvalEnabled } from './config';
import { siteContext } from '$lib/server/site';

export type LabNotesStaffContext = {
	orgId: string;
	userId: string;
};

/**
 * Verified staff = signed-in human session with `document.publish` in the eval org.
 * API keys, preview capability tokens, and shared bearer tokens are not staff identity.
 */
export async function requireLabNotesStaffSession(
	locals: App.Locals
): Promise<LabNotesStaffContext> {
	if (!labNotesEvalEnabled()) error(404, 'Not found');
	const auth = locals.auth;
	if (auth?.type !== 'session' || !auth.user?.id) {
		error(401, 'Staff session required');
	}
	if (!hasCapability(auth, 'document.publish')) {
		error(403, 'Staff publish capability required');
	}
	const { orgId } = await siteContext(locals);
	return { orgId, userId: auth.user.id };
}

export async function staffLocalContext(locals: App.Locals) {
	const { orgId, userId } = await requireLabNotesStaffSession(locals);
	const auth = locals.auth!;
	return {
		orgId,
		userId,
		context: { ...authToContext(auth), organizationId: orgId }
	};
}
