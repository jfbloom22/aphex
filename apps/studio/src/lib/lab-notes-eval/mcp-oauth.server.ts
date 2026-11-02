import { mcp } from 'better-auth/plugins';
import { labNotesEvalEnabled, labNotesEvalOrigin } from './config';

/** Register Better Auth MCP/OIDC plugin for Open WebUI (LAB_NOTES_EVAL only). */
export function labNotesBetterAuthExtend(base: Record<string, unknown>): Record<string, unknown> {
	if (!labNotesEvalEnabled()) return base;
	const origin = labNotesEvalOrigin();
	const plugins = Array.isArray(base.plugins) ? [...base.plugins] : [];
	return {
		...base,
		plugins: [
			...plugins,
			mcp({
				loginPage: '/login',
				consentPage: '/oauth/mcp-consent',
				resource: origin,
				oidcConfig: {
					requirePKCE: true,
					allowPlainCodeChallengeMethod: false
				}
			})
		]
	};
}
