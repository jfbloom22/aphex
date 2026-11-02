import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	appName: 'Aphex Lab Notes'
});
