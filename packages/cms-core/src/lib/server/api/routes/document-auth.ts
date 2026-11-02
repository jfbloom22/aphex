import type { Auth } from '../../../types/auth';
import { authToContext } from '../../../local-api/auth-helpers';
import type { LocalAPIContext } from '../../../local-api/types';

/** Session/API-key context for document routes; rejects partial sessions (no org). */
export function documentRouteContext(auth: Auth | null | undefined): LocalAPIContext {
	if (!auth || auth.type === 'partial_session') {
		throw new DocumentAuthError('Authentication required');
	}
	try {
		return authToContext(auth);
	} catch {
		throw new DocumentAuthError('Authentication required');
	}
}

export class DocumentAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DocumentAuthError';
	}
}
