import { error } from '@sveltejs/kit';
import { hasCapability } from '@aphexcms/cms-core';
import type { Auth } from '@aphexcms/cms-core';
import { labNotesServiceEnabled } from './config';

/** Staff session, MCP OAuth user, or API key with draft read access. */
export function requirePreviewTokenMinter(auth: Auth | null | undefined): void {
	if (!labNotesServiceEnabled()) error(404, 'Not found');
	if (!auth || auth.type === 'partial_session') {
		error(401, 'Authentication required');
	}
	if (!hasCapability(auth, 'document.read')) {
		error(403, 'document.read capability required');
	}
}
