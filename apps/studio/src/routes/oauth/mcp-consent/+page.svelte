<script lang="ts">
	import { page } from '$app/state';
	import { Button } from '@aphexcms/ui/shadcn/button';
	import * as Card from '@aphexcms/ui/shadcn/card';

	let { data } = $props();
	let error = $state('');
	let loading = $state(false);

	const consentCode = $derived(page.url.searchParams.get('consent_code') ?? '');
	const clientId = $derived(page.url.searchParams.get('client_id') ?? '');
	const scope = $derived(page.url.searchParams.get('scope') ?? 'openid');

	async function respond(accept: boolean) {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/auth/oauth2/consent', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ accept, consent_code: consentCode || undefined })
			});
			if (res.redirected) {
				window.location.href = res.url;
				return;
			}
			const body = await res.json().catch(() => ({}));
			if (!res.ok) {
				error = body.message ?? `Consent failed (${res.status})`;
				return;
			}
			if (body.url) window.location.href = body.url;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<main class="mx-auto flex min-h-[60vh] max-w-md items-center p-6">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>Allow MCP access</Card.Title>
			<Card.Description>
				{data.appName} wants to act as you in chat tools (drafts only — not publish).
			</Card.Description>
		</Card.Header>
		<Card.Content class="text-muted-foreground space-y-3 text-sm">
			<p><span class="text-foreground font-medium">Client:</span> {clientId || 'unknown'}</p>
			<p><span class="text-foreground font-medium">Scopes:</span> {scope}</p>
			{#if error}
				<p class="text-destructive">{error}</p>
			{/if}
		</Card.Content>
		<Card.Footer class="flex gap-2">
			<Button variant="outline" disabled={loading} onclick={() => respond(false)}>Deny</Button>
			<Button disabled={loading || !consentCode} onclick={() => respond(true)}>Allow</Button>
		</Card.Footer>
	</Card.Root>
</main>
