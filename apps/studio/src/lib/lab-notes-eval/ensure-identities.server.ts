import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseAdapter } from '@aphexcms/cms-core/server';
import type { OrganizationRole } from '@aphexcms/cms-core';
import { auth, authService } from '$lib/server/auth';
import { labNotesEvalDataDir, labNotesEvalEnabled } from './config';

const EVAL_PASSWORD = 'LabNotesEval-Local-Only-2026';

type EvalIdentitySpec = {
	key: string;
	email: string;
	password: string;
	role: OrganizationRole | null;
	mcpKeyFile?: string;
	mcpCapabilities?: string[];
};

const IDENTITIES: EvalIdentitySpec[] = [
	{
		key: 'staffA',
		email: 'lab-notes-staff-a@eval.local',
		password: EVAL_PASSWORD,
		role: 'editor'
	},
	{
		key: 'staffB',
		email: 'lab-notes-staff-b@eval.local',
		password: EVAL_PASSWORD,
		role: 'editor'
	},
	{
		key: 'outsider',
		email: 'lab-notes-outsider@eval.local',
		password: EVAL_PASSWORD,
		role: null
	}
];

let ensurePromise: Promise<void> | null = null;

async function writeEvalManifest(
	orgId: string,
	extra: Record<string, { email: string; password: string; userId?: string }>
) {
	await mkdir(labNotesEvalDataDir(), { recursive: true });
	const manifest = {
		orgId,
		passwordNote: 'Eval-only fixed password for local SPR-071 spike; not production identity.',
		users: extra
	};
	await writeFile(
		join(labNotesEvalDataDir(), 'eval-identities.json'),
		JSON.stringify(manifest, null, 2)
	);
}

async function ensureUser(spec: EvalIdentitySpec): Promise<string> {
	let user = await authService.getUserByEmail(spec.email);
	if (!user) {
		const result = await auth.api.signUpEmail({
			body: {
				email: spec.email,
				password: spec.password,
				name: spec.key
			}
		});
		if (result.error) {
			throw new Error(`signUp ${spec.email}: ${result.error.message ?? 'failed'}`);
		}
		user = await authService.getUserByEmail(spec.email);
	}
	if (!user?.id) throw new Error(`Missing user id for ${spec.email}`);
	return user.id;
}

async function runEnsure(adapter: DatabaseAdapter): Promise<void> {
	const orgs = await adapter.findAllOrganizations();
	const org = orgs[0];
	if (!org) return;

	const manifestUsers: Record<string, { email: string; password: string; userId: string }> = {};

	for (const spec of IDENTITIES) {
		const userId = await ensureUser(spec);
		manifestUsers[spec.key] = { email: spec.email, password: spec.password, userId };
		if (spec.role) {
			const existing = await adapter.findUserMembership(userId, org.id);
			if (!existing) {
				await adapter.addMember({
					organizationId: org.id,
					userId,
					role: spec.role
				});
			}
		}
	}

	await writeEvalManifest(org.id, manifestUsers);
}

/** Idempotent eval staff/outsider principals for local verification (not production SSO). */
export function ensureLabNotesEvalIdentities(adapter: DatabaseAdapter): Promise<void> {
	if (!labNotesEvalEnabled()) return Promise.resolve();
	if (!ensurePromise) {
		ensurePromise = runEnsure(adapter).catch((err) => {
			ensurePromise = null;
			console.error('[lab-notes-eval] ensure identities failed:', err);
			throw err;
		});
	}
	return ensurePromise;
}
