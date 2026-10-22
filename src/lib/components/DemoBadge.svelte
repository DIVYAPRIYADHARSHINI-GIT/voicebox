<script lang="ts">
	// Persistent reminder that this build stores everything in one browser.
	import Icon from './Icon.svelte';
	import { app } from '$lib/app.svelte.ts';

	let expanded = $state(false);
</script>

<div class="demo-badge" data-testid="demo-badge">
	<button class="pillbtn" onclick={() => (expanded = !expanded)} aria-expanded={expanded} aria-label="About demo mode">
		<Icon name="info" size={14} />
		<span>Demo mode: shared demo data, open to everyone</span>
	</button>
	{#if expanded}
		<div class="pop" role="note">
			<p>
				Feedback, pulse answers and accounts are stored on the server and shared across every device: raise a ticket on a
				phone and it appears in the manager portal on a laptop straight away.
			</p>
			<p style="margin-bottom:0">
				This is still a <strong>public demo</strong> with published sign-in details, so anyone can read and change the data.
				Do not put anything confidential in it.
				{#if app.connectionError}<br /><strong>Connection:</strong> {app.connectionError}{/if}
			</p>
			<a href="/about">Read the privacy notes</a>
		</div>
	{/if}
</div>

<style>
	.demo-badge {
		position: fixed;
		left: var(--s-3);
		bottom: var(--s-3);
		z-index: 55;
		max-width: calc(100vw - 24px);
	}
	.pillbtn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		padding: 6px 12px;
		font: inherit;
		font-size: 12px;
		color: var(--text-2);
		box-shadow: var(--shadow-2);
		cursor: pointer;
		min-height: 32px;
	}
	.pillbtn:hover {
		border-color: var(--text-3);
	}
	.pop {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		width: min(340px, calc(100vw - 24px));
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--r-lg);
		box-shadow: var(--shadow-3);
		padding: var(--s-4);
		font-size: 12px;
	}
	.pop p {
		font-size: 12px;
		margin-bottom: var(--s-2);
	}
	@media (max-width: 760px) {
		.demo-badge {
			bottom: 68px;
		}
		.pillbtn span {
			max-width: 60vw;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}
</style>
