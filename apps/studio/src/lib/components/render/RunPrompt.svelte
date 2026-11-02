<script lang="ts">
	import type { CustomBlockComponentProps } from '@portabletext/svelte';

	interface Props {
		portableText: CustomBlockComponentProps<{
			_type: 'runPrompt';
			prompt?: string;
			label?: string;
		}>;
	}

	let { portableText }: Props = $props();
	const value = $derived(portableText.value);

	let copied = $state(false);

	async function copyPrompt() {
		const text = value.prompt ?? '';
		if (!text) return;
		await navigator.clipboard.writeText(text);
		copied = true;
		setTimeout(() => {
			copied = false;
		}, 2000);
	}
</script>

<blockquote class="run-prompt">
	<p class="label">{value.label ?? 'Try this prompt'}</p>
	<pre class="prompt">{value.prompt ?? ''}</pre>
	<div class="actions">
		<button type="button" onclick={copyPrompt}>{copied ? 'Copied' : 'Copy prompt'}</button>
		<span class="hint">Paste into your preferred AI tool.</span>
	</div>
</blockquote>

<style>
	.run-prompt {
		border-left: 4px solid #fb923c;
		padding: 1rem 0 1rem 1.25rem;
		margin: 1.25rem 0;
		background: #fffaf5;
		border-radius: 0 1rem 1rem 0;
	}
	.label {
		margin: 0 0 0.5rem;
		font-weight: 600;
		color: #0f172a;
	}
	.prompt {
		white-space: pre-wrap;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.92rem;
		line-height: 1.6;
		color: #334155;
		margin: 0 0 0.75rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}
	button {
		border: 0;
		background: #1a2a39;
		color: white;
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.hint {
		font-size: 0.8rem;
		color: #64748b;
	}
</style>
