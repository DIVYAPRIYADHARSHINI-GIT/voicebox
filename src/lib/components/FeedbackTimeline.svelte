<script lang="ts">
	// Status history timeline with actor role and time.
	import type { Feedback } from '$lib/core/types.ts';
	import { formatDateTime } from '$lib/core/time.ts';

	interface Props {
		item: Feedback;
	}
	const { item }: Props = $props();

	const roleLabel = (r: string) => (r === 'admin' ? 'Admin/HR' : r === 'manager' ? 'Manager' : r === 'submitter' ? 'Submitter' : r === 'employee' ? 'Employee' : 'System');
	const events = $derived([...item.history].sort((a, b) => a.at - b.at));
</script>

<ol class="timeline" data-testid="status-timeline">
	{#each events as e, i (i)}
		<li>
			<span class="dot" aria-hidden="true"></span>
			<div>
				<div class="line">{e.note || (e.to ? `Status changed to ${e.to}` : 'Updated')}</div>
				<div class="caption">{roleLabel(e.actorRole)} &middot; {formatDateTime(e.at)}</div>
			</div>
		</li>
	{/each}
</ol>

<style>
	.timeline {
		list-style: none;
		margin: 0;
		padding: 0;
		position: relative;
	}
	.timeline::before {
		content: '';
		position: absolute;
		left: 4px;
		top: 6px;
		bottom: 10px;
		width: 1px;
		background: var(--border);
	}
	li {
		display: flex;
		gap: var(--s-3);
		padding-bottom: var(--s-3);
		position: relative;
	}
	li:last-child {
		padding-bottom: 0;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--surface);
		border: 2px solid var(--teal);
		margin-top: 5px;
		flex: none;
		z-index: 1;
	}
	.line {
		font-size: 13px;
		color: var(--text);
	}
</style>
