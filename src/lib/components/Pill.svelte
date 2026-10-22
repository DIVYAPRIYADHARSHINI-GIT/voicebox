<script lang="ts">
	// Status / priority / sentiment pill. Meaning is always carried by the text
	// label as well as the colour (never colour alone).
	interface Props {
		kind: 'status' | 'priority' | 'sentiment' | 'type' | 'plain' | 'overdue' | 'sensitive' | 'anon';
		value: string;
		title?: string;
	}
	const { kind, value, title }: Props = $props();

	const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const cls = $derived(
		kind === 'status'
			? `status-${slug(value)}`
			: kind === 'priority'
				? `prio-${slug(value)}`
				: kind === 'sentiment'
					? `sentiment-${slug(value)}`
					: kind === 'overdue'
						? 'overdue'
						: kind === 'sensitive'
							? 'sensitive'
							: kind === 'anon'
								? 'anon'
								: ''
	);
</script>

<span class="pill {cls}" {title}>
	{#if kind === 'status' || kind === 'priority'}<span class="dot" aria-hidden="true"></span>{/if}
	{value}
</span>
