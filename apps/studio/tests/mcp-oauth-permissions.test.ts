import { describe, expect, it } from 'vitest';
import { hasCapability } from '@aphexcms/cms-core';
import type { OAuthAccessAuth } from '@aphexcms/cms-core';

describe('MCP OAuth access auth', () => {
	it('omits document.publish from resolved capabilities', () => {
		const auth: OAuthAccessAuth = {
			type: 'oauth_access',
			user: {
				id: 'user-1',
				email: 'a@eval.local',
				role: 'editor'
			},
			organizationId: 'org-1',
			organizationRole: 'editor',
			capabilities: ['document.read', 'document.create', 'document.update']
		};
		expect(hasCapability(auth, 'document.create')).toBe(true);
		expect(hasCapability(auth, 'document.publish')).toBe(false);
		expect(hasCapability(auth, 'document.unpublish')).toBe(false);
	});
});
