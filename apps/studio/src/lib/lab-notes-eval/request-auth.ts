import type { Auth } from '@aphexcms/cms-core';
import type { Request } from '@sveltejs/kit';

/** Session auth from hooks, or `x-api-key` for automation (MCP eval key). */
export async function resolveLabNotesRequestAuth(
	locals: App.Locals,
	request: Request
): Promise<Auth | null | undefined> {
	if (locals.auth && locals.auth.type !== 'partial_session') return locals.auth;
	const provider = locals.aphexCMS?.config.auth?.provider;
	if (!provider) return locals.auth;
	try {
		const fromKey = await provider.validateApiKey(request, locals.aphexCMS.databaseAdapter);
		return fromKey ?? locals.auth;
	} catch {
		return locals.auth;
	}
}
