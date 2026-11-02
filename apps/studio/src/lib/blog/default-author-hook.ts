import { resolveDefaultAuthorReference } from './default-author-context';

function authorReferenceIsSet(author: unknown): boolean {
	if (!author || typeof author !== 'object') return false;
	const ref = (author as { _ref?: unknown })._ref;
	return typeof ref === 'string' && ref.length > 0;
}

/** Default `author` on create when empty and the signed-in user has a linked author doc. */
export async function defaultAuthorOnCreateHook({
	data,
	operation,
	context
}: {
	data: Record<string, unknown>;
	operation: 'create' | 'update';
	context: { organizationId: string; userId?: string };
}) {
	if (operation !== 'create') return data;
	if (authorReferenceIsSet(data.author)) return data;
	if (!context.userId) return data;

	const ref = await resolveDefaultAuthorReference({
		organizationId: context.organizationId,
		userId: context.userId
	});
	if (!ref) return data;

	return { ...data, author: ref };
}
