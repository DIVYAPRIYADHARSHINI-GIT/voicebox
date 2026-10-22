<script lang="ts">
	// Warning shown in the last minute before the 15-minute inactivity sign-out.
	import { app } from '$lib/app.svelte.ts';
	import Icon from './Icon.svelte';
</script>

{#if app.idleWarning && app.session}
	<div class="idle" role="alert" data-testid="idle-warning">
		<Icon name="clock" size={16} />
		<span>You will be signed out shortly because of inactivity.</span>
		<button class="btn sm primary" onclick={() => app.touch()} data-testid="idle-stay">Stay signed in</button>
	</div>
{/if}

<style>
	.idle {
		position: fixed;
		top: var(--s-3);
		left: 50%;
		transform: translateX(-50%);
		z-index: 65;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		background: var(--amber-050);
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: var(--r);
		padding: var(--s-2) var(--s-3);
		box-shadow: var(--shadow-2);
		font-size: 13px;
		max-width: calc(100vw - 24px);
	}
</style>
