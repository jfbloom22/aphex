<script lang="ts">
	import type { CustomBlockComponentProps } from '@portabletext/svelte';
	import { untrack } from 'svelte';

	type Level = 'explorer' | 'guide' | 'builder';

	interface Props {
		portableText: CustomBlockComponentProps<{
			_type: 'fluencyLevelPicker';
			initialLevel?: string;
		}>;
	}

	let { portableText }: Props = $props();

	const labels: Record<Level, { title: string; detail: string }> = {
		explorer: {
			title: 'Explorer',
			detail: 'Trying tools, building vocabulary, learning where AI helps and where it misleads.'
		},
		guide: {
			title: 'Guide',
			detail:
				'Steering work with prompts, checks, and judgment. The shift Lab Notes keeps pointing at.'
		},
		builder: {
			title: 'Builder',
			detail: 'Designing workflows, teaching others, and owning the system around the model.'
		}
	};

	const initial = $derived(
		(['explorer', 'guide', 'builder'] as const).includes(portableText.value.initialLevel as Level)
			? (portableText.value.initialLevel as Level)
			: 'guide'
	);

	let level = $state<Level>(untrack(() => initial));
</script>

<div class="widget" aria-labelledby="fluency-heading">
	<h3 id="fluency-heading">Where is your team on the fluency curve?</h3>
	<p class="hint">Choose a level to explore how your team can grow.</p>
	<div class="levels" role="radiogroup" aria-label="AI fluency level">
		{#each Object.keys(labels) as key}
			{@const id = key as Level}
			<button
				type="button"
				class:selected={level === id}
				role="radio"
				aria-checked={level === id}
				onclick={() => (level = id)}
			>
				{labels[id].title}
			</button>
		{/each}
	</div>
	<p class="detail"><strong>{labels[level].title}:</strong> {labels[level].detail}</p>
</div>

<style>
	.widget {
		border: 1px solid #e2e8f0;
		border-radius: 12px;
		padding: 1.25rem;
		background: #fff;
		margin: 1.5rem 0;
	}
	.hint {
		font-size: 0.85rem;
		color: #64748b;
		margin-top: 0;
	}
	.levels {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	button {
		border: 1px solid #cbd5e1;
		background: #f8fafc;
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		cursor: pointer;
		font-weight: 600;
	}
	button.selected {
		border-color: #fe3c00;
		background: #fff7f3;
		color: #1a2a39;
	}
	.detail {
		margin-bottom: 0;
	}
</style>
