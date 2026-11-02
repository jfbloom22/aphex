export type DefaultAuthorHookContext = {
	organizationId: string;
	userId: string;
};

export type DefaultAuthorReference = { _type: 'reference'; _ref: string };

type DefaultAuthorResolver = (
	ctx: DefaultAuthorHookContext
) => Promise<DefaultAuthorReference | null>;

let resolver: DefaultAuthorResolver | null = null;

export function registerDefaultAuthorResolver(fn: DefaultAuthorResolver): void {
	resolver = fn;
}

export async function resolveDefaultAuthorReference(
	ctx: DefaultAuthorHookContext
): Promise<DefaultAuthorReference | null> {
	return resolver ? resolver(ctx) : null;
}
